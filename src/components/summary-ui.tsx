import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, ChevronRight, Circle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvatarMini } from "@/components/avatar-mini";

/**
 * Kepingan UI untuk halaman Ringkasan semua peran (studio developer/freelancer/pribadi, dashboard client, GOBI WORK).
 * Gayanya mengikuti beranda: kartu rounded-2xl, hero biru tua dengan cahaya oranye, ikon dalam lingkaran oranye lembut.
 */

/** Kelas tombol outline di atas hero biru tua (dipakai bersama `Button variant="outline"`). */
export const heroOutline = "border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white";

export function SummaryHero({ eyebrow, title, subtitle, avatar, aside, children }: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  avatar?: { name: string; url: string | null };
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-navy-deep p-5 text-white shadow-lg ring-1 ring-white/10 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-14 -top-14 size-52 rounded-full bg-primary/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/3 size-44 rounded-full bg-sky-400/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start gap-4">
        {avatar && (
          <span className="rounded-full bg-gradient-to-tr from-primary to-amber-400 p-0.5">
            <span className="block rounded-full bg-navy-deep p-0.5"><AvatarMini name={avatar.name} url={avatar.url} size={56} /></span>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="inline-flex rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-xs text-white/80">{eyebrow}</p>
          <h1 className="mt-2 break-words text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-white/70">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children && <div className="relative mt-5 flex flex-wrap gap-2">{children}</div>}
    </section>
  );
}

export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={cn("grid grid-cols-2 gap-3", cols === 3 && "lg:grid-cols-3", cols === 4 && "lg:grid-cols-4")}>{children}</div>;
}

export function StatTile({ label, value, Icon, to, params, hint, accent }: {
  label: string;
  value: ReactNode;
  Icon: LucideIcon;
  to?: string;
  params?: Record<string, string>;
  hint?: string;
  accent?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
        {to && <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />}
      </div>
      <p className="mt-3 truncate text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls = cn("group block min-w-0 rounded-2xl border bg-card p-4 transition", accent ? "border-primary/60 bg-primary/5" : "border-border", to && "hover:border-primary/60 hover:shadow-sm");
  return to ? <Link to={to} params={params as never} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function SectionCard({ title, Icon, more, children, className }: { title: string; Icon: LucideIcon; more?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="flex items-center gap-2 text-base font-bold"><Icon className="size-4 text-primary" />{title}</h2>
        {more && <span className="text-xs font-medium text-link hover:underline">{more}</span>}
      </div>
      {children}
    </section>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export type ActionItem = { key: string; to: string; label: string; Icon: LucideIcon; count?: number; valueLabel?: string };

/** Daftar hal yang menunggu pengguna. Hanya item dengan jumlah lebih dari nol yang tampil. */
export function ActionList({ items }: { items: ActionItem[] }) {
  const active = items.filter((i) => (i.count ?? 0) > 0);
  if (!active.length) {
    return <p className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-emerald-500" /> Tidak ada yang menunggu. Semua beres.</p>;
  }
  return (
    <ul className="mt-1 pb-1">
      {active.map(({ key, to, label, Icon, count, valueLabel }) => (
        <li key={key}>
          <Link to={to} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="size-4" /></span>
            <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
            <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-xs font-bold text-primary-foreground">{valueLabel ?? count}</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type Shortcut = { to: string; label: string; desc: string; Icon: LucideIcon; search?: Record<string, string> };

export function ShortcutGrid({ items }: { items: Shortcut[] }) {
  if (!items.length) return <EmptyHint>Belum ada pintasan.</EmptyHint>;
  return (
    <ul className="grid gap-2 p-3 sm:grid-cols-2">
      {items.map((s) => (
        <li key={s.to + s.label}>
          <Link to={s.to} search={s.search as never} className="group flex items-center gap-3 rounded-xl border border-border p-3 transition hover:border-primary/50 hover:bg-accent/40">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><s.Icon className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{s.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{s.desc}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type Step = { key: string; label: string; to: string; done: boolean };

/** Langkah awal dengan bilah kemajuan. Hilang sendiri kalau semua langkah sudah selesai. */
export function StepsCard({ title = "Langkah awal", steps, Icon }: { title?: string; steps: Step[]; Icon: LucideIcon }) {
  const done = steps.filter((s) => s.done).length;
  if (!steps.length || done === steps.length) return null;
  return (
    <SectionCard title={title} Icon={Icon} more={<span className="font-mono text-muted-foreground">{done}/{steps.length}</span>}>
      <div className="px-4 pt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ul className="mt-1 pb-2">
        {steps.map((s) => (
          <li key={s.key}>
            <Link to={s.to} className="flex items-center gap-3 px-4 py-2 hover:bg-accent/40">
              {s.done ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
              <span className={cn("min-w-0 flex-1 truncate text-sm", s.done && "text-muted-foreground line-through")}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
