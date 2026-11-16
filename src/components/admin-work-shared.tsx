// Bagian bersama tab admin GOBI WORK yang dipakai untuk meninjau data (lamaran, lowongan, transaksi): pengambilan data dan komponen tampilan.
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { errMsg } from "@/lib/market";
import { looseDb } from "@/lib/escrow-db";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { must } from "@/components/admin-work-extra";

export type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null; headline: string | null; skills: string[] | null };
export type People = Record<string, Profile>;
type Result = PromiseLike<{ data: unknown; error: unknown }>;

/** Profil beberapa pengguna sekaligus (dipecah per 50 id supaya URL permintaan tidak terlalu panjang). */
export async function profileMap(ids: (string | null | undefined)[]): Promise<People> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const out: People = {};
  if (!uniq.length) return out;
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 50) chunks.push(uniq.slice(i, i + 50));
  const parts = await Promise.all(chunks.map((c) => must<Profile[]>(looseDb.from("profiles").select("id,username,display_name,avatar_url,headline,skills").in("id", c))));
  for (const rows of parts) for (const p of rows ?? []) out[p.id] = p;
  return out;
}

export const handle = (p?: Profile) => (p ? `@${p.username}` : "—");
export const nameOf = (p?: Profile) => p?.display_name || p?.username || "Pengguna";

/** Mencoba daftar kolom dari yang terlengkap ke yang paling dasar, supaya halaman tetap jalan sebelum SQL GOBI WORK terbaru dijalankan. */
export async function selectFirst<T>(variants: string[], run: (cols: string) => Result): Promise<T[]> {
  let last: unknown = null;
  for (const cols of variants) {
    const { data, error } = await run(cols);
    if (!error) return (data ?? []) as T[];
    last = error;
  }
  throw new Error(errMsg(last));
}

/** Jumlah baris dari kueri `head: true`; null bila kolom/tabelnya belum ada, sehingga kartu statistik menampilkan "—". */
export async function countOf(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count, error } = await q;
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

/** Seperti `must`, tetapi galat (mis. tabel belum ada) menghasilkan null agar satu bagian detail tidak menggagalkan seluruh dialog. */
export async function soft<T>(p: Result): Promise<T | null> {
  try {
    return await must<T>(p);
  } catch {
    return null;
  }
}

export const fmtCount = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("id-ID"));
export const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** Deretan kartu statistik. `cols` memakai kelas grid Tailwind lengkap. */
export function StatGrid({ children, cols = "lg:grid-cols-4" }: { children: ReactNode; cols?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3", cols)}>{children}</div>;
}

/** Judul kecil di atas sekelompok kartu statistik. */
export function GroupTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

/** Kotak fakta ringkas pada kartu daftar: label kecil, nilai tebal, dan keterangan opsional. */
export function Fact({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-secondary/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm font-bold">{children}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

/** Pasangan label–nilai di dialog detail. */
export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children ?? "—"}</dd>
    </div>
  );
}

/** Satu bagian di dialog detail, dengan judul dan garis pemisah. */
export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h4 className="text-sm font-extrabold">{title}</h4>
      {children}
    </section>
  );
}

export function FilterSelect({ value, onChange, label, options, className }: {
  value: string; onChange: (v: string) => void; label: string; options: readonly (readonly [string, string])[]; className?: string;
}) {
  return (
    <div className={className ?? "w-48"}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function MoreButton({ onClick, busy, children }: { onClick: () => void; busy?: boolean; children: ReactNode }) {
  return (
    <div className="flex justify-center pt-1">
      <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={onClick}>{busy && <Loader2 className="animate-spin" />}{children}</Button>
    </div>
  );
}
