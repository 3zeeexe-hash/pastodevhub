import { describe, expect, it } from "vitest";
import { serviceOwnerMoveOk, type ServiceStatus } from "./services";
import {
  OWNER_ACTION_TARGET, digitsOnly, parseSkills, serviceOwnerActions, serviceReadiness, splitLines, type OwnerAction,
} from "./services-owner";

const basic = { tier: "basic" as const, name: "Landing page", price: 150_000, delivery_days: 3, revisions: 1 };
const ready = { title: "Jasa landing page", description: "Landing page responsif dengan desain profesional.", category_slug: "landing-page", cover_url: "https://x.test/a.png" };

describe("aksi pemilik jasa", () => {
  it("draft bisa diedit, diajukan, dan dihapus; hanya draft yang bisa dihapus", () => {
    expect(serviceOwnerActions({ status: "draft", adminHold: false })).toEqual(["edit", "submit", "delete"]);
    for (const s of ["pending_review", "published", "paused", "rejected", "archived"] as ServiceStatus[]) {
      expect(serviceOwnerActions({ status: s, adminHold: false })).not.toContain("delete");
    }
  });
  it("jasa yang sedang ditinjau tidak bisa diedit, hanya ditarik", () => {
    expect(serviceOwnerActions({ status: "pending_review", adminHold: false })).toEqual(["withdraw"]);
  });
  it("jasa yang ditahan admin tidak bisa dibuka atau diarsipkan pemiliknya", () => {
    const a = serviceOwnerActions({ status: "paused", adminHold: true });
    expect(a).not.toContain("resume");
    expect(a).not.toContain("archive");
  });
  it("setiap aksi bertarget status konsisten dengan aturan trigger database", () => {
    const statuses: ServiceStatus[] = ["draft", "pending_review", "published", "paused", "rejected", "archived"];
    for (const status of statuses) {
      for (const adminHold of [false, true]) {
        for (const action of serviceOwnerActions({ status, adminHold })) {
          const target = OWNER_ACTION_TARGET[action as OwnerAction];
          if (!target) continue;
          expect(serviceOwnerMoveOk(status, target, { moderated: true, adminHold, wasPublished: true })).toBe(true);
        }
      }
    }
  });
});

describe("kelengkapan jasa", () => {
  it("jasa lengkap dengan satu paket siap diajukan", () => {
    expect(serviceReadiness(ready, [basic])).toEqual([]);
  });
  it("menyebutkan semua kekurangan", () => {
    const probs = serviceReadiness({ title: "abc", description: "pendek", category_slug: null, cover_url: null }, []);
    expect(probs).toEqual(expect.arrayContaining([
      "Judul minimal 5 karakter", "Deskripsi minimal 30 karakter", "Pilih kategori", "Unggah gambar sampul", "Isi satu paket atau tiga paket",
    ]));
  });
  it("dua paket belum siap", () => {
    expect(serviceReadiness(ready, [basic, { ...basic, tier: "standard" }]).length).toBeGreaterThan(0);
  });
});

describe("parsing input form", () => {
  it("skill dipangkas, tanpa duplikat, dibatasi 15 butir dan 30 karakter", () => {
    expect(parseSkills(" react, Next.js ,REACT,, ")).toEqual(["react", "Next.js"]);
    expect(parseSkills(Array.from({ length: 20 }, (_, i) => `s${i}`).join(","))).toHaveLength(15);
    expect(parseSkills("x".repeat(50))[0]).toHaveLength(30);
  });
  it("fitur satu per baris dan angka saja", () => {
    expect(splitLines("a\n\n  b  \n")).toEqual(["a", "b"]);
    expect(digitsOnly("Rp 150.000")).toBe("150000");
  });
});
