import { describe, expect, it } from "vitest";
import { groupStories, isStoryActive, storyExpiresAt, storyTimeLeft, type Story } from "./stories";

const author = { username: "budi", display_name: null, avatar_url: null };
const mk = (id: string, authorId: string, created: string, expires?: string): Story => ({
  id, author_id: authorId, body: "hai", image_url: null, bg: "senja", created_at: created,
  expires_at: expires ?? storyExpiresAt(created).toISOString(), author: { ...author, username: authorId },
});

describe("story hilang setelah 1 hari", () => {
  it("berakhir tepat 24 jam setelah dibuat", () => {
    expect(storyExpiresAt("2026-11-13T00:00:00.000Z").toISOString()).toBe("2026-11-14T00:00:00.000Z");
  });
  it("masih tampil 23 jam 59 menit setelah dibuat", () => {
    expect(isStoryActive({ created_at: "2026-11-13T00:00:00.000Z" }, new Date("2026-11-13T23:59:00.000Z"))).toBe(true);
  });
  it("hilang setelah 24 jam", () => {
    expect(isStoryActive({ created_at: "2026-11-13T00:00:00.000Z" }, new Date("2026-11-14T00:00:01.000Z"))).toBe(false);
  });
  it("tidak bisa diperpanjang lewat expires_at yang lebih lama", () => {
    expect(isStoryActive({ created_at: "2026-11-13T00:00:00.000Z", expires_at: "2026-11-20T00:00:00.000Z" }, new Date("2026-11-14T01:00:00.000Z"))).toBe(false);
  });
  it("menampilkan sisa waktu dalam jam", () => {
    expect(storyTimeLeft({ created_at: "2026-11-13T00:00:00.000Z" }, new Date("2026-11-13T19:00:00.000Z"))).toBe("sisa 5 jam");
  });
});

describe("urutan story", () => {
  const now = new Date("2026-11-13T12:00:00.000Z");
  it("story saya dulu, lalu yang belum dilihat, lalu yang sudah dilihat; story kedaluwarsa dibuang", () => {
    const stories = [
      mk("a1", "ani", "2026-11-13T11:00:00.000Z"),
      mk("b1", "budi", "2026-11-13T10:00:00.000Z"),
      mk("me1", "me", "2026-11-13T09:00:00.000Z"),
      mk("old", "cici", "2026-11-12T10:00:00.000Z"),
    ];
    const groups = groupStories(stories, new Set(["a1"]), "me", now);
    expect(groups.map((g) => g.authorId)).toEqual(["me", "budi", "ani"]);
  });
  it("story dalam satu grup diputar dari yang paling lama", () => {
    const groups = groupStories([mk("x2", "ani", "2026-11-13T11:00:00.000Z"), mk("x1", "ani", "2026-11-13T08:00:00.000Z")], new Set(), null, now);
    expect(groups[0]!.stories.map((s) => s.id)).toEqual(["x1", "x2"]);
  });
});
