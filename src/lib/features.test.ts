import { describe, expect, it } from "vitest";
import { featureForPath, isFeatureOn } from "@/lib/features";

describe("feature switches", () => {
  it("treats a feature without a stored switch as on", () => {
    expect(isFeatureOn({}, "jobs")).toBe(true);
    expect(isFeatureOn(undefined, "jobs")).toBe(true);
  });
  it("treats a switched-off feature as off", () => {
    expect(isFeatureOn({ jobs: false }, "jobs")).toBe(false);
    expect(isFeatureOn({ jobs: false }, "karya")).toBe(true);
  });
  it("keeps demo profiles off until an admin switches them on", () => {
    expect(isFeatureOn({}, "demo_profiles")).toBe(false);
    expect(isFeatureOn(undefined, "demo_profiles")).toBe(false);
    expect(isFeatureOn({ demo_profiles: true }, "demo_profiles")).toBe(true);
    expect(isFeatureOn({ demo_profiles: false }, "demo_profiles")).toBe(false);
  });
  it("maps pages to the feature that owns them", () => {
    expect(featureForPath("/lowongan")).toBe("jobs");
    expect(featureForPath("/lowongan/baru")).toBe("jobs");
    expect(featureForPath("/studio/lamaran")).toBe("jobs");
    expect(featureForPath("/discuss/abc")).toBe("discuss");
    expect(featureForPath("/studio/karya/baru")).toBe("karya");
    expect(featureForPath("/toko/budi")).toBe("toko");
    expect(featureForPath("/studio/hosting")).toBe("hosting");
    expect(featureForPath("/budi/proyek/ai")).toBe("ai_editor");
    expect(featureForPath("/new")).toBe("repos");
    expect(featureForPath("/import")).toBe("github");
  });
  it("leaves pages without a feature alone", () => {
    expect(featureForPath("/")).toBeNull();
    expect(featureForPath("/admin")).toBeNull();
    expect(featureForPath("/budi")).toBeNull();
    expect(featureForPath("/budi/proyek")).toBeNull();
    expect(featureForPath("/newsletter")).toBeNull();
    expect(featureForPath("/studio")).toBeNull();
  });
});
