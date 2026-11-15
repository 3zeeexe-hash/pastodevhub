/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

/** Klien longgar: kolom dan fungsi baru belum tentu ada di tipe yang dihasilkan. */
export const sb = supabase as any;
export const DAY = 86_400_000;
export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
export const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("id-ID"));

/** Hitung baris; null kalau tabel belum ada atau query gagal, supaya tampil "—" dan bukan 0 yang menyesatkan. */
export async function cnt(table: string, apply?: (q: any) => any): Promise<number | null> {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  return error ? null : (count ?? 0);
}

/** Ambil baris; daftar kosong kalau gagal. */
export async function rows<T = any>(table: string, cols: string, apply?: (q: any) => any): Promise<T[]> {
  let q = sb.from(table).select(cols);
  if (apply) q = apply(q);
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as T[]);
}
