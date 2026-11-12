import { Check } from "lucide-react";
import { STATUS_LABEL, type OrderStatus } from "@/lib/market";
import { cn } from "@/lib/utils";

const STEPS = ["Permintaan", "Pembayaran", "Pengerjaan", "Hasil", "Selesai"] as const;

function stepOf(status: OrderStatus): number | null {
  switch (status) {
    case "requested": return 0;
    case "awaiting_payment":
    case "payment_review": return 1;
    case "in_progress": return 2;
    case "delivered": return 3;
    case "completed": return 4;
    default: return null;
  }
}

/** Teks "apa yang terjadi sekarang dan apa langkahmu", menurut status dan peran. */
function hint(status: OrderStatus, isBuyer: boolean, isSeller: boolean): string {
  switch (status) {
    case "requested":
      return isSeller ? "Baca kebutuhan client, lalu terima dengan harga final atau tolak." : "Menunggu developer menjawab. Kamu bisa menjelaskan kebutuhan lewat tombol chat.";
    case "awaiting_payment":
      return isBuyer ? "Harga sudah disetujui. Bayar lewat Virtual Account atau QRIS; dana ditahan sampai pekerjaan selesai." : "Menunggu client membayar.";
    case "payment_review":
      return "Pembayaran sedang diverifikasi admin.";
    case "in_progress":
      return isSeller ? "Kerjakan pesanan ini, lalu kirim hasilnya dari halaman ini." : "Developer sedang mengerjakan. Pantau perkembangan lewat chat.";
    case "delivered":
      return isBuyer ? "Periksa hasilnya. Tandai selesai kalau sudah sesuai, atau minta revisi." : "Menunggu client memeriksa hasil.";
    case "completed":
      return "Pesanan selesai.";
    default:
      return STATUS_LABEL[status];
  }
}

export function OrderProgress({ status, isBuyer, isSeller, showSteps = true }: { status: OrderStatus; isBuyer: boolean; isSeller: boolean; showSteps?: boolean }) {
  const idx = stepOf(status);

  if (idx === null) {
    return (
      <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">
        {status === "declined" ? "Developer menolak permintaan ini. Kamu bisa memesan jasa lain." : "Pesanan ini dibatalkan."}
      </p>
    );
  }

  return (
    <section aria-label="Progres pesanan" className="rounded-lg border border-border bg-card p-4">
      {showSteps && (
        <ol className="flex items-start">
          {STEPS.map((label, i) => {
            const done = i < idx || idx === STEPS.length - 1;
            const current = i === idx && !done;
            return (
              <li key={label} className="flex min-w-0 flex-1 flex-col items-center text-center" aria-current={current ? "step" : undefined}>
                <div className="flex w-full items-center">
                  <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : i <= idx ? "bg-primary" : "bg-border")} />
                  <span className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    done ? "bg-primary text-primary-foreground" : current ? "bg-background text-primary ring-2 ring-primary" : "bg-muted text-muted-foreground",
                  )}>
                    {done ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span className={cn("h-0.5 flex-1", i === STEPS.length - 1 ? "bg-transparent" : i < idx ? "bg-primary" : "bg-border")} />
                </div>
                <span className={cn("mt-1.5 text-[11px] leading-tight", current ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
              </li>
            );
          })}
        </ol>
      )}
      <p className={cn("text-sm", showSteps && "mt-3 border-t border-border pt-3")}><b>Langkah sekarang:</b> {hint(status, isBuyer, isSeller)}</p>
    </section>
  );
}
