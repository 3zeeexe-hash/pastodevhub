import { describe, expect, it } from "vitest";
import { filterInbox, mergeInbox, messengerSearch, previewBody, resolveFilter, unreadByFilter, type DmRow, type OrderRow, type WorkRow } from "./inbox";

const dm = (id: string, at: string, unread = 0, name = "Sari"): DmRow => ({
  conversation_id: id, username: name.toLowerCase(), display_name: name, avatar_url: null, last_body: "halo", last_sender: "u2", last_at: at, unread,
});
const work = (id: string, at: string, unread = 0): WorkRow => ({
  id, jobTitle: "Website toko batik", otherName: "Budi", otherUsername: "budi", otherAvatar: null, lastBody: "kapan selesai?", lastSender: "u3", lastAt: at, unread,
});
const order = (id: string, at: string): OrderRow => ({
  id, number: 1042, title: "Logo startup", otherName: "Dewi", otherUsername: "dewi", otherAvatar: null, lastBody: "sudah saya kirim", lastSender: "u4", lastAt: at,
});

describe("mergeInbox", () => {
  it("menggabungkan tiga sumber dan mengurutkan aktivitas terbaru di atas", () => {
    const list = mergeInbox([dm("a", "2026-11-10T10:00:00Z")], [work("w1", "2026-11-12T10:00:00Z")], [order("o1", "2026-11-11T10:00:00Z")]);
    expect(list.map((i) => i.key)).toEqual(["work:w1", "order:o1", "dm:a"]);
  });
  it("sumber kosong tidak masalah", () => {
    expect(mergeInbox([], [], [])).toEqual([]);
    expect(mergeInbox([dm("a", "2026-11-10T10:00:00Z")], [], []).map((i) => i.kind)).toEqual(["dm"]);
  });
  it("memberi konteks: judul lowongan, nomor + judul pesanan, kosong untuk DM", () => {
    const [w, o, d] = mergeInbox([dm("a", "2026-11-01T00:00:00Z")], [work("w1", "2026-11-03T00:00:00Z")], [order("o1", "2026-11-02T00:00:00Z")]);
    expect(w!.context).toBe("Website toko batik");
    expect(o!.context).toBe("Pesanan #1042 · Logo startup");
    expect(d!.context).toBeNull();
  });
  it("waktu sama: urutan stabil menurut kunci", () => {
    const t = "2026-11-10T10:00:00Z";
    expect(mergeInbox([dm("b", t), dm("a", t)], [], []).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("filterInbox", () => {
  const all = mergeInbox([dm("a", "2026-11-10T10:00:00Z")], [work("w1", "2026-11-12T10:00:00Z")], [order("o1", "2026-11-11T10:00:00Z")]);
  it("menyaring menurut jenis", () => {
    expect(filterInbox(all, "semua", "")).toHaveLength(3);
    expect(filterInbox(all, "pribadi", "").map((i) => i.kind)).toEqual(["dm"]);
    expect(filterInbox(all, "kerja", "").map((i) => i.kind)).toEqual(["work"]);
    expect(filterInbox(all, "pesanan", "").map((i) => i.kind)).toEqual(["order"]);
  });
  it("mencari di nama, konteks, dan isi pesan", () => {
    expect(filterInbox(all, "semua", "batik").map((i) => i.kind)).toEqual(["work"]);
    expect(filterInbox(all, "semua", "  LOGO ").map((i) => i.kind)).toEqual(["order"]);
    expect(filterInbox(all, "semua", "kapan").map((i) => i.kind)).toEqual(["work"]);
    expect(filterInbox(all, "semua", "sari").map((i) => i.kind)).toEqual(["dm"]);
    expect(filterInbox(all, "kerja", "logo")).toEqual([]);
  });
});

describe("unreadByFilter", () => {
  it("menghitung percakapan (bukan pesan) yang belum dibaca per jenis", () => {
    const items = mergeInbox([dm("a", "2026-11-10T10:00:00Z", 3), dm("b", "2026-11-09T10:00:00Z", 0)], [work("w1", "2026-11-12T10:00:00Z", 2)], [order("o1", "2026-11-11T10:00:00Z")]);
    expect(unreadByFilter(items)).toEqual({ semua: 2, pribadi: 1, kerja: 1, pesanan: 0 });
  });
});

describe("resolveFilter", () => {
  it("memakai filter, lalu parameter tab lama, lalu semua", () => {
    expect(resolveFilter({ filter: "pesanan", tab: "kerja" })).toBe("pesanan");
    expect(resolveFilter({ tab: "kerja" })).toBe("kerja");
    expect(resolveFilter({ tab: "biasa" })).toBe("pribadi");
    expect(resolveFilter({})).toBe("semua");
  });
});

describe("messengerSearch", () => {
  it("satu tujuan dengan prioritas lamaran > pesanan > username", () => {
    expect(messengerSearch({ application: "a1", order: "o1", username: "x" })).toEqual({ application: "a1" });
    expect(messengerSearch({ order: "o1", username: "x" })).toEqual({ order: "o1" });
    expect(messengerSearch({ username: "x" })).toEqual({ u: "x" });
    expect(messengerSearch({})).toEqual({});
  });
});

describe("previewBody", () => {
  it("memberi penanda foto", () => {
    expect(previewBody("halo", null)).toBe("halo");
    expect(previewBody("lihat ini", "https://x/y.jpg")).toBe("📷 lihat ini");
    expect(previewBody("  ", "https://x/y.jpg")).toBe("📷 Foto");
  });
});
