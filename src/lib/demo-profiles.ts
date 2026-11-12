// Demo profiles are sample developer profiles an admin can show so the developer list does not look empty.
// They are always labelled, and they can never be hired, messaged, followed or applied to.
// The database enforces the same rules (see docs/demo-profiles.md); this file only drives the labels.

export const DEMO_LABEL = "Contoh profil";

export const DEMO_NOTICE =
  "Ini profil contoh untuk mengisi tampilan situs, bukan developer sungguhan. Tidak bisa dipesan, dilamar, difollow, atau dikirimi pesan.";

/** True when a profile row is a labelled sample profile (the `is_demo` column on `profiles`). */
export function isDemoProfile(p: unknown): boolean {
  return (p as { is_demo?: boolean } | null | undefined)?.is_demo === true;
}
