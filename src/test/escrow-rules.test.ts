import { describe, expect, it } from "vitest";
import { escrowStage } from "@/lib/midtrans-shared";

const held = { status: "held" };

describe("escrow stages (tanpa masa tahan 1 hari)", () => {
  it("tidak lagi punya konstanta atau tahap masa tahan", async () => {
    const mod = await import("@/lib/midtrans-shared");
    expect("ESCROW_HOLD_HOURS" in mod).toBe(false);
  });

  it("jasa yang belum diterima client menunggu hasil, tanpa menunggu waktu apa pun", () => {
    expect(escrowStage(held, "service", "in_progress")).toBe("waiting_delivery");
    expect(escrowStage(held, "service", "delivered")).toBe("waiting_delivery");
  });

  it("jasa yang sudah diterima tetapi dananya masih tersimpan bisa diteruskan admin segera (sisa data lama)", () => {
    expect(escrowStage(held, "service", "completed")).toBe("ready_for_admin");
  });

  it("karya yang dibeli langsung tersedia untuk developer", () => {
    expect(escrowStage(held, "product", "completed")).toBe("auto_available");
  });

  it("menjaga dana yang dibekukan, diteruskan, dan direfund di luar alur normal", () => {
    expect(escrowStage({ status: "frozen" }, "service", "completed")).toBe("frozen");
    expect(escrowStage({ status: "released" }, "service", "completed")).toBe("released");
    expect(escrowStage({ status: "refunded" }, "product", "completed")).toBe("refunded");
  });
});
