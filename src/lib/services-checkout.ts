// GOBI SERVICES Fase 5: aturan murni untuk checkout dan permintaan khusus (validasi form, pemilihan add-on, ringkasan biaya).
// Cermin dari docs/sql/gobi-services/005_gobi_services_checkout.sql — database tetap penentu akhir:
// semua angka di sini hanya untuk pratinjau; harga resmi selalu dihitung ulang oleh service_create_order.
import { calcServiceOrderPricing } from "./services";
import { validAmount } from "./work";

export const BRIEF_MIN = 10;
export const BRIEF_MAX = 5000;
export const MAX_REFERENCES = 5;
export const MAX_ADDON_QTY = 10;
export const MAX_ADDONS = 10;
export const MAX_UNPAID_ORDERS = 10;

export const CUSTOM_TITLE_MIN = 5;
export const CUSTOM_TITLE_MAX = 120;
export const CUSTOM_DESC_MIN = 20;
export const CUSTOM_DESC_MAX = 4000;
export const CUSTOM_NOTE_MAX = 1000;
export const CUSTOM_MAX_DEADLINE_DAYS = 730;

// ---- Lampiran referensi ----
export type Reference = { url: string; name: string };

/** Tautan lampiran harus https, tanpa spasi, maks 2000 karakter (cermin `_service_url`). */
export function validReferenceUrl(url: string): boolean {
  const u = url.trim();
  return u.length > 0 && u.length <= 2000 && /^https:\/\/\S+$/.test(u);
}

/** Memangkas, membuang tautan tidak valid dan duplikat, membatasi 5 butir. Nama dipotong 120 karakter. */
export function normalizeReferences(list: Reference[]): Reference[] {
  const seen = new Set<string>();
  const out: Reference[] = [];
  for (const r of list) {
    const url = r.url.trim();
    if (!validReferenceUrl(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, name: r.name.trim().slice(0, 120) });
    if (out.length === MAX_REFERENCES) break;
  }
  return out;
}

// ---- Add-on ----
/** id add-on -> jumlah. Jumlah 0 berarti tidak dipilih. */
export type AddonSelection = Record<string, number>;

export function clampQty(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_ADDON_QTY, Math.trunc(n)));
}

/** Payload `_addons` untuk RPC: hanya yang dipilih, jumlah bulat 1–10. */
export function selectionToPayload(sel: AddonSelection): { id: string; quantity: number }[] {
  return Object.entries(sel)
    .map(([id, q]) => ({ id, quantity: clampQty(q) }))
    .filter((a) => a.quantity > 0)
    .slice(0, MAX_ADDONS);
}

export type CheckoutPackage = { id: string; name: string; price: number; delivery_days: number; revisions: number };
export type CheckoutAddon = { id: string; name: string; price: number; extra_days: number; extra_revisions: number };

export type CheckoutLine = { kind: "package" | "addon"; name: string; quantity: number; unitPrice: number; lineTotal: number };

/** Pratinjau biaya di sisi klien. Total resmi datang dari `service_checkout_quote`. */
export function checkoutPreview(pkg: CheckoutPackage, addons: CheckoutAddon[], sel: AddonSelection) {
  const chosen = addons
    .map((a) => ({ a, qty: clampQty(sel[a.id] ?? 0) }))
    .filter((x) => x.qty > 0);
  const pricing = calcServiceOrderPricing({
    packagePrice: pkg.price,
    packageDays: pkg.delivery_days,
    packageRevisions: pkg.revisions,
    addons: chosen.map(({ a, qty }) => ({ price: a.price, quantity: qty, extraDays: a.extra_days, extraRevisions: a.extra_revisions })),
    commissionPercent: 0,
  });
  const lines: CheckoutLine[] = [
    { kind: "package", name: pkg.name, quantity: 1, unitPrice: pkg.price, lineTotal: pkg.price },
    ...chosen.map(({ a, qty }) => ({ kind: "addon" as const, name: a.name, quantity: qty, unitPrice: a.price, lineTotal: a.price * qty })),
  ];
  return { lines, total: pricing.total, deliveryDays: pricing.deliveryDays, revisions: pricing.revisions };
}

// ---- Validasi form ----
export function checkoutErrors(f: { brief: string; acceptTerms: boolean }): string[] {
  const out: string[] = [];
  const n = f.brief.trim().length;
  if (n < BRIEF_MIN) out.push(`Jelaskan kebutuhanmu minimal ${BRIEF_MIN} karakter.`);
  if (n > BRIEF_MAX) out.push(`Kebutuhan maksimal ${BRIEF_MAX} karakter.`);
  if (!f.acceptTerms) out.push("Setujui detail pesanan dan ketentuan jasa.");
  return out;
}

export type CustomRequestForm = { title: string; description: string; budget: string; deadline: string; note: string };

/** Hari ini dalam format YYYY-MM-DD menurut zona waktu lokal (untuk `min` pada input tanggal). */
export function todayISO(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export function customRequestErrors(f: CustomRequestForm, now: Date = new Date()): string[] {
  const out: string[] = [];
  const t = f.title.trim().length;
  const d = f.description.trim().length;
  if (t < CUSTOM_TITLE_MIN || t > CUSTOM_TITLE_MAX) out.push(`Judul kebutuhan ${CUSTOM_TITLE_MIN}–${CUSTOM_TITLE_MAX} karakter.`);
  if (d < CUSTOM_DESC_MIN || d > CUSTOM_DESC_MAX) out.push(`Deskripsi ${CUSTOM_DESC_MIN}–${CUSTOM_DESC_MAX} karakter.`);
  if (f.note.trim().length > CUSTOM_NOTE_MAX) out.push(`Catatan maksimal ${CUSTOM_NOTE_MAX} karakter.`);
  const budget = f.budget.replace(/\D/g, "");
  if (budget) {
    const b = Number(budget);
    if (!validAmount(b) || b < 1000) out.push("Budget minimal Rp1.000.");
  }
  if (f.deadline) {
    const today = todayISO(now);
    const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + CUSTOM_MAX_DEADLINE_DAYS);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.deadline)) out.push("Format deadline tidak valid.");
    else if (f.deadline < today) out.push("Deadline tidak boleh sebelum hari ini.");
    else if (f.deadline > todayISO(limit)) out.push("Deadline maksimal 2 tahun ke depan.");
  }
  return out;
}

/** Kunci idempotensi satu sesi checkout: pemanggilan ulang dengan kunci sama mengembalikan pesanan yang sama. */
export function newRequestKey(): string {
  return crypto.randomUUID();
}

// ---- Bentuk data dari fungsi baca ----
export type CheckoutQuote = {
  subtotal: number; total: number; delivery_days: number; revisions: number;
  items: { kind: "package" | "addon"; id: string; name: string; unit_price: number; quantity: number; extra_days: number; extra_revisions: number }[];
};

export type ServiceOrderRow = {
  order_id: string; stage: string; is_custom: boolean; package_snapshot: {
    service_title?: string; tier?: string; name?: string; description?: string; price?: number; delivery_days?: number;
    revisions?: number; features?: string[]; work_limit?: string;
  };
  delivery_days: number; revisions_included: number; revisions_used: number; terms_accepted_at: string | null;
};
export type OrderItemRow = { id: string; kind: "package" | "addon"; name: string; unit_price: number; quantity: number; extra_days: number; extra_revisions: number };
export type RequirementRow = { id: string; kind: string; body: string; attachments: Reference[]; created_at: string };
export type OrderEventRow = { id: number; event: string; from_stage: string | null; to_stage: string | null; created_at: string };
