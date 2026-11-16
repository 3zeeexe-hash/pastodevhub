import { describe, expect, it } from "vitest";
import { FEATURES, featureForPath, isFeatureOn, isMaintenanceOpenPath } from "@/lib/features";

describe("feature switches", () => {
  it("treats a feature without a stored switch as on", () => {
    expect(isFeatureOn({}, "jobs")).toBe(true);
    expect(isFeatureOn(undefined, "jobs")).toBe(true);
  });
  it("treats a switched-off feature as off", () => {
    expect(isFeatureOn({ jobs: false }, "jobs")).toBe(false);
    expect(isFeatureOn({ jobs: false }, "karya")).toBe(true);
  });
  it("maps pages to the feature that owns them", () => {
    expect(featureForPath("/lowongan")).toBe("jobs");
    expect(featureForPath("/lowongan/baru")).toBe("jobs");
    expect(featureForPath("/studio/lamaran")).toBe("jobs");
    expect(featureForPath("/kerja")).toBe("jobs");
    expect(featureForPath("/kerja/kontrak/123")).toBe("jobs");
    expect(featureForPath("/gobifeed/abc")).toBe("discuss");
    expect(featureForPath("/studio/karya/baru")).toBe("karya");
    expect(featureForPath("/toko/budi")).toBe("toko");
    expect(featureForPath("/studio/hosting")).toBe("hosting");
    expect(featureForPath("/budi/proyek/ai")).toBe("ai_editor");
    expect(featureForPath("/new")).toBe("repos");
    expect(featureForPath("/import")).toBe("github");
    expect(featureForPath("/gobifeed")).toBe("discuss");
    expect(featureForPath("/explore")).toBe("explore");
    expect(featureForPath("/verifikasi")).toBe("verifikasi");
    expect(featureForPath("/studio/verifikasi")).toBe("verifikasi");
  });
  it("maps the newer page switches", () => {
    expect(featureForPath("/search")).toBe("pencarian");
    expect(featureForPath("/notifikasi")).toBe("notifikasi");
    expect(featureForPath("/dashboard")).toBe("dashboard");
    expect(featureForPath("/saldo")).toBe("saldo");
    expect(featureForPath("/studio/saldo")).toBe("saldo");
    expect(featureForPath("/gobifeed/tersimpan")).toBe("tersimpan");
    expect(featureForPath("/gobifeed/tag/react")).toBe("tagar");
    expect(featureForPath("/gobifeed/notifikasi")).toBe("gobifeed_notifikasi");
    expect(featureForPath("/discuss")).toBe("forum");
  });
  it("maps repo pages by pattern without catching other pages", () => {
    expect(featureForPath("/budi/proyek/issues")).toBe("issue_pr");
    expect(featureForPath("/budi/proyek/issues/12")).toBe("issue_pr");
    expect(featureForPath("/budi/proyek/pulls")).toBe("issue_pr");
    expect(featureForPath("/budi/proyek/commits")).toBe("riwayat_commit");
    expect(featureForPath("/budi/proyek/commit/abc123")).toBe("riwayat_commit");
    expect(featureForPath("/budi/proyek/edit/src/a.ts")).toBe("editor_web");
    expect(featureForPath("/budi/proyek/new")).toBe("editor_web");
    expect(featureForPath("/kerja/kontrak/baru")).toBe("jobs");
    expect(featureForPath("/studio/jasa/new")).toBeNull();
    expect(featureForPath("/budi/proyek")).toBeNull();
  });
  it("keeps every feature key unique and matches the database key format", () => {
    const keys = FEATURES.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z_]{2,40}$/);
  });
  it("keeps maintenance mode from locking admins out", () => {
    expect(isMaintenanceOpenPath("/auth")).toBe(true);
    expect(isMaintenanceOpenPath("/admin/fitur")).toBe(true);
    expect(isMaintenanceOpenPath("/reset-password")).toBe(true);
    expect(isMaintenanceOpenPath("/")).toBe(false);
    expect(isMaintenanceOpenPath("/authors")).toBe(false);
    expect(featureForPath("/")).toBeNull();
  });
  it("does not close the work chat tab when direct messages are off", () => {
    expect(featureForPath("/gobifeed/pesan")).toBe("discuss");
    expect(isFeatureOn({ dm: false }, "discuss")).toBe(true);
  });
  it("leaves pages without a feature alone", () => {
    expect(featureForPath("/")).toBeNull();
    expect(featureForPath("/admin")).toBeNull();
    expect(featureForPath("/budi")).toBeNull();
    expect(featureForPath("/budi/proyek")).toBeNull();
    expect(featureForPath("/newsletter")).toBeNull();
    expect(featureForPath("/kerjasama")).toBeNull();
    expect(featureForPath("/studio")).toBeNull();
  });
});
