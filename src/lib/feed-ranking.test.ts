import { describe, expect, it } from "vitest";
import { RANKED_MAX_OFFSET, engagement, isTrendingPost, nextRankedCursor } from "@/lib/feed-rules";

const CUT = "2026-10-29T00:00:00.000Z";
const base = { personal: true, limit: 20, offset: 0, backfillBefore: CUT };

describe("engagement dan tren", () => {
  it("memakai bobot yang sama dengan skor di database", () => {
    expect(engagement({ like_count: 3, reply_count: 2, repost_count: 1 })).toBe(3 + 4 + 3);
    expect(engagement({ like_count: 0, reply_count: 0, repost_count: 0 })).toBe(0);
  });

  it("menolak post tanpa interaksi dari Tren, sekecil apa pun interaksi lain meloloskannya", () => {
    expect(isTrendingPost({ like_count: 0, reply_count: 0, repost_count: 0 })).toBe(false);
    expect(isTrendingPost({ like_count: 1, reply_count: 0, repost_count: 0 })).toBe(true);
    expect(isTrendingPost({ like_count: 0, reply_count: 1, repost_count: 0 })).toBe(true);
    expect(isTrendingPost({ like_count: 0, reply_count: 0, repost_count: 1 })).toBe(true);
  });
});

describe("kursor halaman berperingkat", () => {
  it("lanjut ke offset berikutnya selama halaman penuh", () => {
    expect(nextRankedCursor({ ...base, fetched: 20 })).toBe("20");
    expect(nextRankedCursor({ ...base, fetched: 20, offset: 40 })).toBe("60");
  });

  it("Untuk Kamu menyambung ke post lama setelah daftar berperingkat habis", () => {
    expect(nextRankedCursor({ ...base, fetched: 7 })).toBe(CUT);
    expect(nextRankedCursor({ ...base, fetched: 0, offset: 20 })).toBe(CUT);
  });

  it("Tren berhenti saat daftar berperingkat habis", () => {
    expect(nextRankedCursor({ ...base, personal: false, fetched: 7 })).toBeNull();
    expect(nextRankedCursor({ ...base, personal: false, fetched: 0, offset: 20 })).toBeNull();
  });

  it("tidak pernah meminta offset di atas batas fungsi database", () => {
    const last = RANKED_MAX_OFFSET - 20;
    expect(nextRankedCursor({ ...base, fetched: 20, offset: last })).toBe(String(RANKED_MAX_OFFSET));
    expect(nextRankedCursor({ ...base, fetched: 20, offset: RANKED_MAX_OFFSET })).toBe(CUT);
    expect(nextRankedCursor({ ...base, personal: false, fetched: 20, offset: RANKED_MAX_OFFSET })).toBeNull();
  });
});
