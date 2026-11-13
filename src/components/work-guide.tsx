import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Clock, Hourglass, ListChecks } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { cn } from "@/lib/utils";

// ============ Perlu tindakan ============
type Todo = { key: string; act: boolean; title: string; hint: string; contractId: string };
type ContractLite = { id: string; title: string; status: string; client_id: string; freelancer_id: string; contract_milestones: { id: string; title: string; status: string }[] | null };

function buildTodos(rows: ContractLite[], uid: string): Todo[] {
  const out: Todo[] = [];
  for (const c of rows) {
    const add = (key: string, act: boolean, title: string, hint: string) => out.push({ key: `${c.id}-${key}`, act, title, hint, contractId: c.id });
    const ms = c.contract_milestones ?? [];
    if (c.status === "disputed") add("dispute", false, "Sengketa sedang ditinjau admin", c.title);
    if (c.client_id === uid) {
      if (c.status === "draft") add("draft", true, "Lengkapi dan kirim kontrak", c.title);
      if (c.status === "waiting_approval") add("wait", false, "Menunggu freelancer menyetujui kontrak", c.title);
      for (const m of ms) {
        if (m.status === "awaiting_payment") add(`pay-${m.id}`, true, `Danai milestone: ${m.title}`, `${c.title} · bayar lewat Midtrans, dana ditahan escrow`);
        if (m.status === "submitted") add(`chk-${m.id}`, true, `Periksa hasil: ${m.title}`, `${c.title} · setujui atau minta revisi`);
        if (m.status === "approved") add(`rel-${m.id}`, false, `Menunggu admin meneruskan dana: ${m.title}`, c.title);
      }
    } else if (c.freelancer_id === uid) {
      if (c.status === "waiting_approval") add("resp", true, "Tinjau dan setujui kontrak", c.title);
      for (const m of ms) {
        if (m.status === "funded") add(`go-${m.id}`, true, `Mulai kerjakan: ${m.title}`, `${c.title} · dana sudah masuk escrow`);
        if (m.status === "revision_requested") add(`rev-${m.id}`, true, `Kerjakan revisi: ${m.title}`, c.title);
        if (m.status === "submitted") add(`wc-${m.id}`, false, `Menunggu client memeriksa hasil: ${m.title}`, c.title);
        if (m.status === "approved") add(`wr-${m.id}`, false, `Disetujui, menunggu admin meneruskan dana: ${m.title}`, c.title);
      }
    }
  }
  return out.sort((a, b) => Number(b.act) - Number(a.act)).slice(0, 8);
}

/** Daftar "giliran siapa": apa yang harus kamu kerjakan sekarang dan apa yang sedang menunggu pihak lain. */
export function WorkTodos({ applicantsNew }: { applicantsNew: number }) {
  const { user } = useAuth();
  const uid = user!.id;
  const q = useQuery({
    queryKey: ["work-todos", uid],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await looseDb.from("work_contracts").select("id,title,status,client_id,freelancer_id,contract_milestones(id,title,status)")
        .or(`client_id.eq.${uid},freelancer_id.eq.${uid}`).in("status", ["draft", "waiting_approval", "active", "disputed"]);
      if (error) throw new Error(errMsg(error));
      return buildTodos((data ?? []) as unknown as ContractLite[], uid);
    },
  });
  const todos = q.data ?? [];
  const empty = !q.isLoading && todos.length === 0 && applicantsNew === 0;
  return (
    <section aria-labelledby="todo" className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <h2 id="todo" className="flex items-center gap-2 text-lg font-bold"><ListChecks className="size-5 text-primary" /> Perlu tindakan kamu</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Yang bertanda &quot;Giliranmu&quot; menunggu kamu. Yang lain sedang menunggu pihak lain.</p>
      <ul className="mt-3 space-y-2">
        {applicantsNew > 0 && (
          <li>
            <Link to="/kerja/lamaran" className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-3 hover:border-primary">
              <Clock className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-sm"><b className="block">{applicantsNew} pelamar baru belum kamu tinjau</b><span className="text-muted-foreground">Buka lowongan kamu, lihat profil pelamar, lalu terima atau tolak</span></span>
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">Giliranmu</span>
            </Link>
          </li>
        )}
        {todos.map((t) => (
          <li key={t.key}>
            <Link to="/kerja/kontrak/$id" params={{ id: t.contractId }} className={cn("flex items-center gap-3 rounded-2xl border p-3 hover:border-primary", t.act ? "border-primary/40 bg-primary/5" : "border-border")}>
              {t.act ? <Clock className="size-5 shrink-0 text-primary" /> : <Hourglass className="size-5 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 text-sm"><b className="block">{t.title}</b><span className="text-muted-foreground">{t.hint}</span></span>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", t.act ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{t.act ? "Giliranmu" : "Menunggu"}</span>
            </Link>
          </li>
        ))}
      </ul>
      {empty && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-secondary p-3 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> Tidak ada yang perlu dikerjakan sekarang. Langkah berikutnya: cari lowongan untuk dilamar, atau pasang lowongan untuk mencari freelancer.</p>
      )}
    </section>
  );
}

// ============ Alur kerja ============
type Step = { title: string; body: string; to: string; cta: string };

const FREELANCER: Step[] = [
  { title: "Lengkapi Profil Kerja", body: "Isi keahlian, tarif, dan portofolio supaya client yakin memilihmu.", to: "/kerja/profil", cta: "Buka profil kerja" },
  { title: "Cari dan lamar lowongan", body: "Pilih lowongan yang cocok, tulis penawaran harga dan estimasi hari.", to: "/lowongan", cta: "Cari lowongan" },
  { title: "Pantau lamaran", body: "Status berjalan: Menunggu, Dilihat, Shortlist, Interview, lalu Diterima atau Ditolak. Semua kabar masuk ke Notifikasi.", to: "/kerja/lamaran", cta: "Lihat lamaran saya" },
  { title: "Setujui kontrak", body: "Setelah diterima, client menyiapkan kontrak berisi ruang lingkup dan milestone. Baca, lalu setujui atau minta perubahan.", to: "/kerja/kontrak", cta: "Buka kontrak" },
  { title: "Tunggu dana masuk escrow, lalu kerjakan", body: "Client membayar milestone lewat Midtrans. Dana ditahan aman; kamu mulai bekerja setelah statusnya Didanai.", to: "/kerja/kontrak", cta: "Lihat milestone" },
  { title: "Kirim hasil dan revisi", body: "Kirim hasil kerja beserta tautan. Jika client meminta revisi, perbaiki lalu kirim ulang.", to: "/kerja/kontrak", cta: "Kirim hasil" },
  { title: "Terima dana", body: "Setelah client menyetujui, admin meneruskan dana ke saldo Studio kamu.", to: "/kerja/pembayaran", cta: "Lihat pembayaran" },
];

const CLIENT: Step[] = [
  { title: "Pasang lowongan", body: "Tulis kebutuhan, anggaran, dan tenggat. Admin meninjau sebentar sebelum lowongan tayang.", to: "/lowongan/baru", cta: "Pasang lowongan" },
  { title: "Tinjau pelamar", body: "Buka lowongan, lihat penawaran dan profil pelamar, ajak obrolan, lalu terima yang paling cocok.", to: "/kerja/lamaran", cta: "Lihat lowongan saya" },
  { title: "Siapkan kontrak dan milestone", body: "Tulis ruang lingkup, nilai, dan pecah pekerjaan jadi milestone. Total milestone harus sama dengan nilai kontrak.", to: "/kerja/kontrak", cta: "Buka kontrak" },
  { title: "Kirim kontrak ke freelancer", body: "Freelancer menyetujui atau meminta perubahan. Kontrak aktif setelah kedua pihak setuju.", to: "/kerja/kontrak", cta: "Lihat status kontrak" },
  { title: "Danai milestone", body: "Bayar lewat Midtrans. Dana ditahan escrow Pastodev, belum sampai ke freelancer.", to: "/kerja/pembayaran", cta: "Bayar milestone" },
  { title: "Periksa hasil", body: "Setujui jika sudah sesuai, atau minta revisi dengan catatan yang jelas. Ada masalah? Ajukan sengketa ke admin.", to: "/kerja/kontrak", cta: "Periksa hasil" },
  { title: "Dana diteruskan dan beri ulasan", body: "Admin meneruskan dana ke freelancer. Setelah kontrak selesai, beri ulasan.", to: "/kerja/pembayaran", cta: "Lihat transaksi" },
];

/** Panduan alur dari awal sampai dana cair, per peran. Setiap langkah punya tombol menuju halaman yang dimaksud. */
export function WorkFlow({ defaultRole }: { defaultRole: "freelancer" | "client" }) {
  const [role, setRole] = useState(defaultRole);
  const steps = role === "client" ? CLIENT : FREELANCER;
  const tab = (r: "freelancer" | "client", label: string) => (
    <button type="button" role="tab" aria-selected={role === r} onClick={() => setRole(r)}
      className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition", role === r ? "bg-navy text-white" : "text-muted-foreground hover:bg-accent")}>{label}</button>
  );
  return (
    <section aria-labelledby="alur" className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="alur" className="text-lg font-bold">Alur kerja di GOBI WORK</h2>
          <p className="text-sm text-muted-foreground">Dari lowongan sampai dana cair. Dana selalu lewat escrow, jadi aman untuk kedua pihak.</p>
        </div>
        <div role="tablist" aria-label="Pilih peran" className="flex gap-1 rounded-full bg-secondary p-1">{tab("freelancer", "Saya freelancer")}{tab("client", "Saya client")}</div>
      </div>
      <ol className="mt-4 space-y-0">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border" />}
            <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-sun text-sm font-bold text-primary-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-8">{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.body}</p>
              <Link to={s.to} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">{s.cta} <ArrowRight className="size-3.5" /></Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
