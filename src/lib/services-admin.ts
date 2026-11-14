// GOBI SERVICES Fase 3: aturan murni moderasi jasa oleh admin.
// Cermin dari docs/sql/gobi-services/003_gobi_services_moderation.sql — database tetap penentu akhir.
import { SERVICE_STATUS_LABEL, type ServiceStatus } from "./services";

export type ModerationAction = "approve" | "reject" | "request_changes" | "hold" | "release";

export const MODERATION_LABEL: Record<ModerationAction, string> = {
  approve: "Setujui",
  reject: "Tolak",
  request_changes: "Minta perbaikan",
  hold: "Tahan jasa",
  release: "Buka tahanan",
};

/** Status hasil tiap aksi (cermin `service_admin_moderate`). */
export const MODERATION_RESULT: Record<ModerationAction, ServiceStatus> = {
  approve: "published",
  reject: "rejected",
  request_changes: "draft",
  hold: "paused",
  release: "published",
};

export const MIN_MODERATION_REASON = 10;

/** Aksi yang tersedia bagi admin menurut status jasa. */
export function moderationActions(s: { status: ServiceStatus; adminHold: boolean }): ModerationAction[] {
  if (s.status === "pending_review") return ["approve", "request_changes", "reject"];
  if (s.status === "published") return ["hold"];
  if (s.status === "paused" && s.adminHold) return ["release"];
  return [];
}

/** Pesan galat bila alasan belum memenuhi syarat; null berarti boleh. Persetujuan tidak butuh alasan. */
export function moderationReasonError(action: ModerationAction, note: string): string | null {
  if (action === "approve") return note.trim().length > 1000 ? "Catatan maksimal 1000 karakter." : null;
  const n = note.trim().length;
  if (n < MIN_MODERATION_REASON) return `Alasan wajib diisi (minimal ${MIN_MODERATION_REASON} karakter).`;
  if (n > 1000) return "Catatan maksimal 1000 karakter.";
  return null;
}

export type ModerationEvent = {
  id: number; action: string; from_status: string | null; to_status: string | null; note: string | null; created_at: string; actor: string | null;
};

const st = (s: string | null) => (s && s in SERVICE_STATUS_LABEL ? SERVICE_STATUS_LABEL[s as ServiceStatus] : s ?? "—");

/** Teks riwayat yang mudah dibaca untuk satu perubahan status. */
export function moderationEventLabel(e: Pick<ModerationEvent, "action" | "from_status" | "to_status">): string {
  switch (e.action) {
    case "submitted": return e.to_status === "published" ? "Diterbitkan penjual" : "Diajukan untuk moderasi";
    case "approve": return "Disetujui admin";
    case "reject": return "Ditolak admin";
    case "request_changes": return "Admin meminta perbaikan";
    case "hold": return "Ditahan admin";
    case "release": return "Tahanan admin dibuka";
    default: return `Status: ${st(e.from_status)} → ${st(e.to_status)}`;
  }
}

// ---- Bentuk data dari fungsi baca admin ----
export type AdminServiceStats = {
  sellers: number; services: number; published: number; pending_review: number; draft: number;
  rejected: number; paused: number; held_by_admin: number; archived: number;
};

export type AdminServiceRow = {
  id: string; title: string; status: ServiceStatus; admin_hold: boolean; cover_url: string | null; category_slug: string | null;
  price_from: number; delivery_days: number; created_at: string; published_at: string | null; moderation_note: string | null;
  owner: { id: string; username: string; display_name: string | null };
};

export type AdminServiceList = { total: number; rows: AdminServiceRow[] };

export type AdminServiceDetail = {
  service: {
    id: string; title: string; summary: string; description: string; status: ServiceStatus; admin_hold: boolean; cover_url: string | null;
    category_slug: string | null; subcategory_slug: string | null; skills: string[]; buyer_requirements: string; revision_terms: string;
    scope_limits: string; moderation_note: string | null; price_from: number; delivery_days: number; created_at: string; published_at: string | null;
  };
  owner: { id: string; username: string; display_name: string | null; account_type: string } | null;
  seller: { tagline: string; response_time_hours: number | null; is_active: boolean; suspended_at: string | null } | null;
  packages: { id: string; tier: string; name: string; description: string; price: number; delivery_days: number; revisions: number; features: string[]; work_limit: string }[];
  addons: { id: string; name: string; description: string; price: number; extra_days: number; extra_revisions: number }[];
  faqs: { id: string; question: string; answer: string }[];
  gallery: { id: string; url: string | null; caption: string }[];
  events: ModerationEvent[];
  readiness: string[];
  reports_open: number;
};
