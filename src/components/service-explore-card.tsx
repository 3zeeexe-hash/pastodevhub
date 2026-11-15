import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock, Heart, Star, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { errMsg, formatRupiah } from "@/lib/market";
import { formatRating, type ExploreRow } from "@/lib/services-explore";
import { serviceRpc } from "@/lib/services-db";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { cn } from "@/lib/utils";

/** Tombol favorit. Hanya untuk pengguna yang masuk dan bukan pemilik jasa; keputusan akhir ada di service_toggle_favorite. */
export function FavoriteButton({ serviceId, ownerId, initial, className, label = false }: {
  serviceId: string; ownerId: string; initial: boolean; className?: string; label?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  if (user?.id === ownerId) return null;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { toast("Masuk dulu untuk menyimpan jasa favorit."); return; }
    if (busy) return;
    setBusy(true);
    const prev = on;
    setOn(!prev);
    try {
      const now = await serviceRpc<boolean>("service_toggle_favorite", { _service_id: serviceId });
      setOn(now);
      toast.success(now ? "Ditambahkan ke favorit" : "Dihapus dari favorit");
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["service-fav", serviceId] });
    } catch (err) {
      setOn(prev);
      toast.error(errMsg(err));
    } finally { setBusy(false); }
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={on} aria-label={on ? "Hapus dari favorit" : "Simpan ke favorit"} disabled={busy}
      className={cn("inline-flex items-center gap-1.5 rounded-full bg-background/90 p-2 text-sm shadow-sm ring-1 ring-border transition hover:bg-accent", label && "px-3", className)}>
      <Heart className={cn("size-4", on && "fill-destructive text-destructive")} />
      {label && <span>{on ? "Favorit" : "Simpan"}</span>}
    </button>
  );
}

/** Kartu jasa untuk marketplace: sampul, kategori, judul, penjual, rating, pesanan selesai, harga mulai dari. */
export function ExploreCard({ s }: { s: ExploreRow }) {
  const rating = formatRating(s.rating_avg, s.rating_count);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/60 hover:shadow-md">
      <Link to="/jasa/$id" params={{ id: s.id }} className="flex min-w-0 flex-1 flex-col">
        <div className="aspect-video overflow-hidden bg-muted">
          {s.cover_url
            ? <img src={s.cover_url} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-[1.02]" />
            : <div className="flex size-full items-center justify-center"><Wrench className="size-10 text-primary/60" /></div>}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          {s.category_label && <span className="w-fit rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">{s.category_label}</span>}
          <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug">{s.title}</h3>
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <AvatarMini name={s.owner.username} url={s.owner.avatar_url} size={20} />
            <span className="min-w-0 truncate">{s.owner.display_name || s.owner.username}</span>
            <VerifiedBadge username={s.owner.username} verified={s.owner.is_verified} size={14} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {rating
              ? <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-primary text-primary" />{rating}</span>
              : <span>Belum ada ulasan</span>}
            {s.orders_completed > 0 && <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3.5" />{s.orders_completed} selesai</span>}
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{s.delivery_days} hari</span>
          </div>
          <p className="mt-auto pt-1 text-sm"><span className="text-xs text-muted-foreground">Mulai dari </span><b className="text-primary">{formatRupiah(s.price_from, "Nego")}</b></p>
        </div>
      </Link>
      <FavoriteButton serviceId={s.id} ownerId={s.owner.id} initial={s.is_favorite} className="absolute right-2 top-2" />
    </div>
  );
}
