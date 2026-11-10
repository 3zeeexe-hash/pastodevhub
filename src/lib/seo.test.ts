import { describe, expect, it } from "vitest";
import { jobPostingLd, seoHead, summarize } from "./seo";

describe("summarize", () => {
  it("strips markdown and keeps short text whole", () => {
    expect(summarize("## Halo **dunia** [link](https://x.y)")).toBe("Halo dunia link");
  });
  it("cuts long text at 155 characters", () => {
    expect(summarize("kata ".repeat(100)).length).toBeLessThanOrEqual(155);
  });
});

describe("seoHead", () => {
  it("only tags absolute https images", () => {
    const head = seoHead({ title: "A", description: "B", type: "product", image: "/local.png" }, { title: "x", description: "y" });
    expect(head.meta.some((m) => m["property"] === "og:image")).toBe(false);
  });
  it("adds a self canonical when a path is given", () => {
    expect(seoHead(null, { title: "x", description: "y" }, "/lowongan").links).toEqual([{ rel: "canonical", href: "/lowongan" }]);
  });
});

describe("jobPostingLd", () => {
  it("marks jobs as remote contract work paid in rupiah", () => {
    const ld = jobPostingLd({ title: "Web toko", description: "Buat web", created_at: "2026-11-01T00:00:00Z", deadline: null, budget_min: 1000000, budget_max: 3000000, client: "ardi", skills: ["React"] });
    expect(ld.jobLocationType).toBe("TELECOMMUTE");
    expect((ld as any).baseSalary.currency).toBe("IDR");
    expect(ld.validThrough).toBe("2026-12-01T00:00:00.000Z");
  });
});
