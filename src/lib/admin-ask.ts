import { createContext, useContext } from "react";

/** Tipe, konteks, dan hook `useAskAdmin()` untuk dialog konfirmasi admin. Komponennya ada di `@/components/admin-dialog`. */
export type AskOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Tombol merah untuk tindakan yang tidak bisa dibatalkan. */
  destructive?: boolean;
  /** Tampilkan kolom alasan. `required` mewajibkan diisi sebelum tombol lanjut aktif. */
  reason?: { label: string; placeholder?: string; required?: boolean };
};
export type AskResult = { reason: string } | null;
export type Ask = (opts: AskOptions) => Promise<AskResult>;

export const AskContext = createContext<Ask | null>(null);

export function useAskAdmin(): Ask {
  const ask = useContext(AskContext);
  if (!ask) throw new Error("useAskAdmin harus dipakai di dalam AdminDialogProvider.");
  return ask;
}
