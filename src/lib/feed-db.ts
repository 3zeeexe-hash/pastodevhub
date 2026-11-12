// Akses database untuk tabel feed_* / dm_* yang dibuat lewat docs/sql/ dan belum ada di types.ts (file otomatis),
// jadi klien di-cast ke any di satu tempat ini.
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;

export function fail(error: { message: string } | null | undefined): asserts error is null | undefined {
  if (error) throw new Error(error.message);
}

/** True kalau PostgREST bilang tabel/fungsi belum ada (SQL setup belum diterapkan). */
export function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42P01" || error.code === "42883" ||
    /could not find the (function|table)|schema cache|does not exist/i.test(error.message ?? "")
  );
}
