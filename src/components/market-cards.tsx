import { Link } from "@tanstack/react-router";
import { Clock, Download, Package, Wrench } from "lucide-react";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { categoryLabel, formatRupiah } from "@/lib/market";
import { cn } from "@/lib/utils";

type Owner = { username: string; display_name: string | null; avatar_url: string | null } | null;
export type ProductCardData = { id: string; title: string; summary: string; cover_url: string | null; price: number; category: string; download_count: number; is_published?: boolean; owner: Owner };
export type ServiceCardData = { id: string; title: string; summary: string; cover_url: string | null; price_from: number; delivery_days: number; category: string; is_active?: boolean; owner: Owner };

export const PRODUCT_SELECT = "id,title,summary,cover_url,price,category,download_count,is_published,created_at, owner:profiles!products_owner_id_fkey(username,display_name,avatar_url)";
export const SERVICE_SELECT = "id,title,summary,cover_url,price_from,delivery_days,category,is_active,created_at, owner:profiles!services_owner_id_fkey(username,display_name,avatar_url)";

function Cover({ url, Icon }: { url: string | null; Icon: typeof Package }) {
  return (
    <div className="aspect-video overflow-hidden rounded-t-lg border-b border-border bg-hero">
      {url ? <img src={url} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-[1.03]" /> : <div className="flex size-full items-center justify-center"><Icon className="size-10 text-primary/70" /></div>}
    </div>
  );
}

function OwnerLine({ owner }: { owner: Owner }) {
  if (!owner) return null;
  return <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><AvatarMini name={owner.username} url={owner.avatar_url} size={18} /><span className="truncate">{owner.display_name || owner.username}</span><VerifiedBadge username={owner.username} size={14} /></span>;
}

export function ProductCard({ p }: { p: ProductCardData }) {
  return (
    <Link to="/karya/$id" params={{ id: p.id }} className="group flex flex-col rounded-lg border border-border bg-card transition hover:border-primary/60">
      <Cover url={p.cover_url} Icon={Package} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-semibold leading-snug">{p.title}</h3>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", p.price ? "bg-primary text-primary-foreground" : "bg-success text-success-foreground")}>{formatRupiah(p.price)}</span>
        </div>
        {p.summary && <p className="line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <OwnerLine owner={p.owner} />
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Download className="size-3.5" />{p.download_count}</span>
        </div>
        <span className="text-xs text-muted-foreground">{categoryLabel(p.category)}{p.is_published === false && " · Draf"}</span>
      </div>
    </Link>
  );
}

export function ServiceCard({ s }: { s: ServiceCardData }) {
  return (
    <Link to="/jasa/$id" params={{ id: s.id }} className="group flex flex-col rounded-lg border border-border bg-card transition hover:border-primary/60">
      <Cover url={s.cover_url} Icon={Wrench} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 font-semibold leading-snug">{s.title}</h3>
        {s.summary && <p className="line-clamp-2 text-sm text-muted-foreground">{s.summary}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <OwnerLine owner={s.owner} />
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" />{s.delivery_days} hari</span>
        </div>
        <p className="text-sm">Mulai <b className="text-primary">{formatRupiah(s.price_from, "Nego")}</b>{s.is_active === false && <span className="text-xs text-muted-foreground"> · Nonaktif</span>}</p>
      </div>
    </Link>
  );
}
