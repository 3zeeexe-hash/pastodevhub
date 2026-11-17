// GOBI SERVICES Fase 7 (perbaikan): aturan murni untuk halaman /pesanan/$id.
// Pesanan paket (punya baris service_orders) diproses lewat ServiceWorkflowPanel. Fungsi lama deliver_order / complete_order /
// request_revision ditolak database untuk pesanan itu (trigger _service_flow_guard di SQL 007), jadi tombol lamanya harus disembunyikan.
import type { OrderAction } from "./market";

/** Aksi lama yang mengubah status uang. Untuk pesanan paket, penggantinya ada di panel alur kerja. */
export const LEGACY_FLOW_ACTIONS: readonly OrderAction[] = ["deliver", "complete", "revise"];

type PageFlags = { kind: "product" | "service"; isPackage: boolean | undefined; loading: boolean };

/**
 * Tombol alur lama disembunyikan untuk pesanan jasa yang pasti pesanan paket, dan selama status paketnya belum diketahui
 * (supaya penjual tidak sempat menekan tombol yang akan ditolak database). Bila pemeriksaan gagal (isPackage undefined, tidak memuat),
 * tombol lama tetap tampil: database tetap penentu akhir dan menolak dengan pesan yang jelas bila ternyata pesanan paket.
 */
export function isLegacyFlowHidden(f: PageFlags): boolean {
  return f.kind === "service" && (f.loading || f.isPackage === true);
}

/** Aksi yang boleh ditampilkan halaman pesanan, setelah menyaring alur lama untuk pesanan paket. */
export function pageActions(actions: OrderAction[], f: PageFlags): OrderAction[] {
  return isLegacyFlowHidden(f) ? actions.filter((a) => !LEGACY_FLOW_ACTIONS.includes(a)) : actions;
}

/** Panel alur pengerjaan hanya untuk pesanan jasa yang terbukti pesanan paket. */
export function showWorkflowPanel(f: { kind: "product" | "service"; isPackage: boolean | undefined }): boolean {
  return f.kind === "service" && f.isPackage === true;
}
