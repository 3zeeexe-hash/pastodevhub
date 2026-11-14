import { Clock, XCircle } from "lucide-react";
import type { ModerationStatus } from "@/lib/job-review";
import { cn } from "@/lib/utils";

/** Kabar untuk pemilik lowongan: sedang ditinjau admin atau ditolak. Lowongan yang sudah disetujui tidak menampilkan apa pun. */
export function JobReviewBanner({ status, note, className }: { status: ModerationStatus; note?: string | null; className?: string }) {
  if (status === "approved") return null;
  const rejected = status === "rejected";
  const Icon = rejected ? XCircle : Clock;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-2xl p-4 text-sm ring-1",
        rejected
          ? "bg-destructive/10 text-destructive ring-destructive/30"
          : "bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30",
        className,
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-bold">{rejected ? "Lowongan ditolak admin" : "Menunggu peninjauan admin"}</p>
        <p className="mt-0.5 break-words">
          {rejected
            ? note?.trim() || "Perbaiki isi lowongan, lalu pasang ulang."
            : "Lowongan belum tampil di daftar dan belum bisa dilamar. Setelah admin menyetujui, lowongan tampil otomatis dan kamu mendapat notifikasi."}
        </p>
      </div>
    </div>
  );
}
