import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Check, Circle, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { errMsg, safeUrl } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VerifiedBadge, useVerifiedUsernames } from "@/components/verified-badge";

export const Route = createFileRoute("/studio/verifikasi")({
  head: () => ({
    meta: [
      { title: "Verifikasi developer — Pastodev" },
      { name: "description", content: "Ajukan centang biru untuk akun developer kamu." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerificationPage,
});

type Req = {
  id: string;
  message: string;
  proof_url: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

// The verification tables are not in the generated types until the database change is applied.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function VerificationPage() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const verifiedSet = useVerifiedUsernames();
  const [message, setMessage] = useState("");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["my-verification", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await sb
        .from("verification_requests")
        .select("id,message,proof_url,status,admin_note,created_at,reviewed_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) return { missing: true, rows: [] as Req[] };
      return { missing: false, rows: (data ?? []) as Req[] };
    },
  });

  const rows = data?.rows ?? [];
  const pending = rows.find((r) => r.status === "pending");
  const isVerified = !!profile && !!verifiedSet.data?.has(profile.username);
  const checklist: [string, boolean][] = [
    ["Foto profil", !!profile?.avatar_url],
    ["Headline (jabatan / keahlian singkat)", !!profile?.headline],
    ["Bio", !!profile?.bio],
    ["Minimal satu skill", (profile?.skills?.length ?? 0) > 0],
    ["Website atau link profesional", !!profile?.website],
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 20) { toast.error("Jelaskan dirimu minimal 20 karakter."); return; }
    if (proof.trim() && !safeUrl(proof.trim())) { toast.error("Link bukti harus diawali http:// atau https://"); return; }
    setBusy(true);
    const { error } = await sb.rpc("request_verification", { _message: message.trim(), _proof_url: proof.trim() || null });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Pengajuan terkirim. Admin akan memeriksanya.");
    setMessage("");
    setProof("");
    qc.invalidateQueries({ queryKey: ["my-verification"] });
  }

  async function cancel(id: string) {
    setBusy(true);
    const { error } = await sb.rpc("cancel_verification_request", { _request: id });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Pengajuan dibatalkan");
    qc.invalidateQueries({ queryKey: ["my-verification"] });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><BadgeCheck className="size-6 text-sky-500" /> Verifikasi developer</h1>
        <p className="mt-1 text-sm text-muted-foreground">Akun terverifikasi mendapat centang biru di sebelah namanya, di profil, kartu karya, kartu jasa, dan hasil pencarian.</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Memuat…</p>
      ) : data?.missing && !isVerified ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Fitur verifikasi belum aktif di server ini. Hubungi admin.</p>
      ) : isVerified ? (
        <section className="rounded-xl border border-border bg-success/10 p-5">
          <p className="flex items-center gap-2 font-semibold">
            <VerifiedBadge verified size={22} /> Akun kamu sudah terverifikasi
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Centang biru tampil di sebelah namamu. Kalau admin mencabutnya, kamu bisa mengajukan lagi di sini.</p>
        </section>
      ) : pending ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <p className="flex items-center gap-2 font-semibold"><Clock className="size-5 text-primary" /> Menunggu pemeriksaan admin</p>
          <p className="mt-1 text-sm text-muted-foreground">Dikirim {timeAgo(pending.created_at)}.</p>
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{pending.message}</p>
          <Button variant="outline" size="sm" className="mt-3" disabled={busy} onClick={() => cancel(pending.id)}>Batalkan pengajuan</Button>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">Lengkapi profil dulu</h2>
            <p className="mt-1 text-sm text-muted-foreground">Admin menilai dari profil, portofolio, dan bukti yang kamu kirim. Profil yang lengkap lebih mudah disetujui.</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {checklist.map(([label, ok]) => (
                <li key={label} className="flex items-center gap-2">
                  {ok ? <Check className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
                  <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
                </li>
              ))}
            </ul>
            <Button asChild variant="secondary" size="sm" className="mt-3"><Link to="/settings">Edit profil</Link></Button>
          </section>
          <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">Ajukan verifikasi</h2>
            <div>
              <Label htmlFor="v-message">Ceritakan tentang dirimu</Label>
              <Textarea id="v-message" rows={5} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="Pengalamanmu, jenis proyek yang dikerjakan, dan kenapa akunmu layak diverifikasi." />
              <p className="mt-1 text-xs text-muted-foreground">{message.trim().length}/1000 (minimal 20)</p>
            </div>
            <div>
              <Label htmlFor="v-proof">Link bukti (opsional)</Label>
              <Input id="v-proof" value={proof} maxLength={500} onChange={(e) => setProof(e.target.value)} placeholder="https://github.com/kamu, portofolio, LinkedIn…" />
            </div>
            <Button disabled={busy || message.trim().length < 20}>{busy && <Loader2 className="animate-spin" />} Kirim pengajuan</Button>
          </form>
        </>
      )}

      {rows.some((r) => r.status !== "pending") && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Riwayat pengajuan</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {rows.filter((r) => r.status !== "pending").map((r) => (
              <li key={r.id} className="py-2">
                <p>
                  <b className={r.status === "approved" ? "text-success" : "text-destructive"}>{r.status === "approved" ? "Disetujui" : "Ditolak"}</b>
                  <span className="text-muted-foreground"> · {timeAgo(r.reviewed_at ?? r.created_at)}</span>
                </p>
                {r.admin_note && <p className="mt-0.5 text-muted-foreground">Catatan admin: {r.admin_note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
