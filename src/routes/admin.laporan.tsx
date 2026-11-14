import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { timeAgo, useAuth } from "@/lib/auth";
import { fetchReports, resolveReportsForPost, type ReportRow, type ReportStatus } from "@/lib/feed-moderation";
import { reportReasonLabel } from "@/lib/feed-rules";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAskAdmin } from "@/lib/admin-ask";
import { GobiLoader } from "@/components/gobi-loader";

export const Route = createFileRoute("/admin/laporan")({
  head: () => ({ meta: [{ title: "Laporan Diskusi — Admin Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: ReportsPage,
});

const TABS: { value: ReportStatus; label: string }[] = [
  { value: "open", label: "Terbuka" },
  { value: "resolved", label: "Ditindak" },
  { value: "dismissed", label: "Diabaikan" },
];
const ACTION_LABEL: Record<string, string> = { post_deleted: "Post dihapus", reviewed: "Ditinjau", dismissed: "Diabaikan" };

function ReportsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<ReportStatus>("open");
  const list = useQuery({ queryKey: ["admin-reports", status], queryFn: () => fetchReports(status) });

  const ask = useAskAdmin();
  const act = useMutation({
    mutationFn: (v: { r: ReportRow; status: "resolved" | "dismissed"; deletePost: boolean }) => {
      if (!user || !v.r.post_id) throw new Error("Post sudah tidak ada.");
      return resolveReportsForPost({ postId: v.r.post_id, adminId: user.id, status: v.status, deletePost: v.deletePost });
    },
    onSuccess: async (_d, v) => {
      toast.success(v.deletePost ? "Post dihapus dan laporan ditutup." : v.status === "dismissed" ? "Laporan diabaikan." : "Laporan ditandai selesai.");
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin-reports"] }), qc.invalidateQueries({ queryKey: ["feed"] })]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Beberapa pelapor untuk post yang sama ditampilkan sebagai satu kartu dengan jumlah laporan.
  const groups = new Map<string, ReportRow[]>();
  for (const r of list.data ?? []) {
    const key = r.post_id ?? r.id;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">Post di Linimasa yang dilaporkan pengguna. Menutup laporan berlaku untuk semua laporan terbuka pada post yang sama.</p>

      <div className="mt-4 flex gap-1 border-b border-border" role="tablist" aria-label="Status laporan">
        {TABS.map((t) => (
          <button key={t.value} role="tab" aria-selected={status === t.value} onClick={() => setStatus(t.value)}
            className={cn("border-b-2 px-4 py-2 text-sm font-medium", status === t.value ? "border-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {list.isLoading ? (
          <GobiLoader />
        ) : list.error ? (
          <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            Gagal memuat laporan: {list.error.message}. Pastikan docs/sql/0007_diskusi_fase4.sql sudah diterapkan.
          </p>
        ) : groups.size === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">Tidak ada laporan {TABS.find((t) => t.value === status)?.label.toLowerCase()}.</p>
        ) : (
          [...groups.values()].map((rows) => {
            const first = rows[0] as ReportRow;
            return (
              <article key={first.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{reportReasonLabel(first.reason)}</span>
                  {rows.length > 1 && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">{rows.length} laporan</span>}
                  <span className="text-muted-foreground">penulis {first.author ? `@${first.author.username}` : "(akun dihapus)"}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{timeAgo(first.created_at)}</span>
                </div>
                {/* Teks biasa, bukan HTML: isi post tidak dirender sebagai markup. */}
                <blockquote className="mt-3 whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-sm">{first.snapshot || "(kosong)"}</blockquote>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {rows.map((r) => (
                    <li key={r.id}>@{r.reporter?.username ?? "?"}{r.note ? `: “${r.note}”` : ""}</li>
                  ))}
                </ul>
                {status === "open" && first.post_id ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/discuss/status/$id" params={{ id: first.post_id }}><ExternalLink /> Buka post</Link>
                    </Button>
                    <Button size="sm" variant="destructive" disabled={act.isPending}
                      onClick={async () => { if (await ask({ title: "Hapus post ini?", description: "Post dihapus dan semua laporan untuknya ditutup. Tidak bisa dibatalkan.", confirmLabel: "Hapus post", destructive: true })) act.mutate({ r: first, status: "resolved", deletePost: true }); }}>
                      Hapus post
                    </Button>
                    <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ r: first, status: "resolved", deletePost: false })}>Tandai selesai</Button>
                    <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ r: first, status: "dismissed", deletePost: false })}>Abaikan</Button>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {first.action ? ACTION_LABEL[first.action] ?? first.action : "Selesai"}
                    {first.resolved_at ? ` · ${timeAgo(first.resolved_at)}` : ""}
                  </p>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
