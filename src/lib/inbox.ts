// Kotak masuk gabungan: pesan pribadi (DM), obrolan kerja (lamaran), dan chat pesanan dalam SATU daftar dan SATU halaman (/gobifeed/pesan).
// Bagian ini murni (tanpa database) supaya mudah diuji. Halaman lain (lowongan, lamaran, jasa, pesanan) tidak punya kolom chat sendiri:
// mereka cukup memakai tombol "Pesan" (components/message-button) yang mengarah ke halaman ini lewat `messengerSearch`.

export type InboxKind = "dm" | "work" | "order";
export type InboxFilter = "semua" | "pribadi" | "kerja" | "pesanan";

export const INBOX_FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "pribadi", label: "Pribadi" },
  { key: "kerja", label: "Kerja" },
  { key: "pesanan", label: "Pesanan" },
];

const KIND_OF_FILTER: Record<Exclude<InboxFilter, "semua">, InboxKind> = { pribadi: "dm", kerja: "work", pesanan: "order" };

export type InboxItem = {
  /** `${kind}:${id}`, unik di seluruh daftar. */
  key: string;
  kind: InboxKind;
  /** dm: id percakapan, work: id lamaran, order: id pesanan. */
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  /** Konteks percakapan: judul lowongan (kerja) atau nomor + judul pesanan; kosong untuk pesan pribadi. */
  context: string | null;
  lastBody: string | null;
  lastSender: string | null;
  lastAt: string;
  unread: number;
};

// Bentuk masukan dibuat struktural supaya modul ini tidak bergantung pada database.
export type DmRow = {
  conversation_id: string; username: string; display_name: string | null; avatar_url: string | null;
  last_body: string; last_sender: string; last_at: string; unread: number;
};
export type WorkRow = {
  id: string; jobTitle: string; otherName: string; otherUsername: string | null; otherAvatar: string | null;
  lastBody: string | null; lastSender: string | null; lastAt: string; unread: number;
};
export type OrderRow = {
  id: string; number: string | number | null; title: string; otherName: string; otherUsername: string | null; otherAvatar: string | null;
  lastBody: string | null; lastSender: string | null; lastAt: string;
};

/** Menggabungkan tiga sumber menjadi satu daftar, aktivitas terbaru di atas. Sumber yang gagal dimuat cukup diberi larik kosong. */
export function mergeInbox(dm: readonly DmRow[], work: readonly WorkRow[], orders: readonly OrderRow[]): InboxItem[] {
  const items: InboxItem[] = [
    ...dm.map((c): InboxItem => ({
      key: `dm:${c.conversation_id}`, kind: "dm", id: c.conversation_id, name: c.display_name || c.username, username: c.username,
      avatarUrl: c.avatar_url, context: null, lastBody: c.last_body, lastSender: c.last_sender, lastAt: c.last_at, unread: c.unread,
    })),
    ...work.map((c): InboxItem => ({
      key: `work:${c.id}`, kind: "work", id: c.id, name: c.otherName, username: c.otherUsername, avatarUrl: c.otherAvatar,
      context: c.jobTitle, lastBody: c.lastBody, lastSender: c.lastSender, lastAt: c.lastAt, unread: c.unread,
    })),
    ...orders.map((c): InboxItem => ({
      key: `order:${c.id}`, kind: "order", id: c.id, name: c.otherName, username: c.otherUsername, avatarUrl: c.otherAvatar,
      context: `${c.number ? `Pesanan #${c.number} · ` : "Pesanan · "}${c.title}`, lastBody: c.lastBody, lastSender: c.lastSender, lastAt: c.lastAt, unread: 0,
    })),
  ];
  return items.sort((a, b) => b.lastAt.localeCompare(a.lastAt) || a.key.localeCompare(b.key));
}

/** Menyaring menurut jenis dan kata kunci (nama, username, konteks, atau isi pesan terakhir; tidak peka huruf besar/kecil). */
export function filterInbox(items: readonly InboxItem[], filter: InboxFilter, query: string): InboxItem[] {
  const needle = query.trim().toLowerCase();
  const kind = filter === "semua" ? null : KIND_OF_FILTER[filter];
  return items.filter((i) => {
    if (kind && i.kind !== kind) return false;
    if (!needle) return true;
    return `${i.name} ${i.username ?? ""} ${i.context ?? ""} ${i.lastBody ?? ""}`.toLowerCase().includes(needle);
  });
}

/** Jumlah percakapan yang punya pesan belum dibaca, per saringan (untuk lencana). */
export function unreadByFilter(items: readonly InboxItem[]): Record<InboxFilter, number> {
  const out: Record<InboxFilter, number> = { semua: 0, pribadi: 0, kerja: 0, pesanan: 0 };
  for (const i of items) {
    if (i.unread <= 0) continue;
    out.semua += 1;
    if (i.kind === "dm") out.pribadi += 1;
    else if (i.kind === "work") out.kerja += 1;
    else out.pesanan += 1;
  }
  return out;
}

/** Saringan awal. `tab` ("biasa" | "kerja") adalah parameter lama dari halaman yang dulu punya dua tab; tetap dihormati supaya tautan lama jalan. */
export function resolveFilter(p: { filter?: InboxFilter | undefined; tab?: "biasa" | "kerja" | undefined }): InboxFilter {
  if (p.filter) return p.filter;
  if (p.tab === "kerja") return "kerja";
  if (p.tab === "biasa") return "pribadi";
  return "semua";
}

export type MessengerTarget = { username?: string | undefined; application?: string | undefined; order?: string | undefined };

/**
 * Parameter pencarian untuk membuka halaman Pesan pada satu percakapan:
 * `username` membuka (atau membuat) pesan pribadi, `application` obrolan lamaran, `order` chat pesanan. Tanpa apa pun = daftar saja.
 * Satu tujuan saja yang dipakai; urutan prioritas: lamaran, pesanan, username.
 */
export function messengerSearch(t: MessengerTarget): { u?: string; application?: string; order?: string } {
  if (t.application) return { application: t.application };
  if (t.order) return { order: t.order };
  if (t.username) return { u: t.username };
  return {};
}

/** Cuplikan pesan terakhir untuk daftar: foto diberi penanda 📷. */
export function previewBody(body: string, imageUrl: string | null | undefined): string {
  if (!imageUrl) return body;
  return body.trim() ? `📷 ${body}` : "📷 Foto";
}
