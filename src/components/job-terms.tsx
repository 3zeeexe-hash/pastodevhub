import { Ban, CalendarCheck, Clock, FileText, RotateCcw, ShieldCheck } from "lucide-react";
import { addDaysISO } from "@/lib/work-deadline";
import type { JobTerms } from "@/lib/job-terms";

const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

/** Penjelasan singkat aturan kerja lowongan ini, ditulis untuk client dan freelancer sekaligus. */
export function JobTermsCard({ terms, className }: { terms: JobTerms; className?: string }) {
  const hourly = terms.paymentType === "hourly";
  const rows: { icon: React.ReactNode; title: string; text: string; wide?: boolean }[] = [
    hourly
      ? { icon: <Clock className="size-4" />, title: "Bayar per jam", text: "Freelancer melaporkan jam mulai dan jam selesai. Client menyetujui laporan, lalu menagih jam yang disetujui." }
      : { icon: <ShieldCheck className="size-4" />, title: "Kerja langsung", text: "Harga tetap sesuai penawaran. Setelah client dan freelancer sama-sama setuju, client membayar (ditahan escrow) dan pekerjaan dimulai." },
    {
      icon: <CalendarCheck className="size-4" />,
      title: "Tanggal selesai",
      text: terms.deadline
        ? `Selesai paling lambat ${fmt(terms.deadline)}. Pelamar memilih tanggal selesai sendiri, tidak boleh melewati tanggal ini.`
        : "Fleksibel. Pelamar menentukan sendiri tanggal selesai yang disepakati.",
    },
  ];
  if (!hourly) {
    rows.push({
      icon: <RotateCcw className="size-4" />,
      title: "Batas revisi",
      text: terms.revisionLimit ? `Maksimal ${terms.revisionLimit} kali revisi. Permintaan di atas batas ditolak sistem.` : "Revisi tidak dibatasi jumlahnya.",
    });
    rows.push({
      icon: <ShieldCheck className="size-4" />,
      title: "Dana diteruskan otomatis",
      text: terms.deadline
        ? `Jika hasil sudah dikirim dan client tidak menyetujui atau meminta revisi sampai akhir hari ${fmt(addDaysISO(terms.deadline, 1))} (1 hari setelah tanggal selesai), dana otomatis masuk ke freelancer.`
        : "Jika hasil sudah dikirim dan client tidak menyetujui atau meminta revisi sampai 1 hari setelah tanggal selesai, dana otomatis masuk ke freelancer.",
    });
  }
  // Ditulis pembuat lowongan (wajib sejak SQL 008); lowongan lama belum punya, jadi baris ini hanya tampil bila terisi.
  if (terms.usageRights) rows.push({ icon: <FileText className="size-4" />, title: "Hak penggunaan hasil pekerjaan", text: terms.usageRights, wide: true });
  if (terms.cancellationTerms) rows.push({ icon: <Ban className="size-4" />, title: "Ketentuan pembatalan", text: terms.cancellationTerms, wide: true });
  return (
    <section className={className} aria-label="Aturan kerja">
      <h2 className="mb-3 font-extrabold">Aturan kerja</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.title} className={`flex gap-3 rounded-xl bg-secondary/60 p-3${r.wide ? " sm:col-span-2" : ""}`}>
            <span className="mt-0.5 shrink-0 text-primary">{r.icon}</span>
            <span className="min-w-0"><span className="block text-sm font-semibold">{r.title}</span><span className="block whitespace-pre-wrap break-words text-xs text-muted-foreground">{r.text}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
