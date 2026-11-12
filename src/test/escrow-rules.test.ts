import { describe, expect, it } from "vitest";
import { ESCROW_HOLD_HOURS, escrowStage } from "@/lib/midtrans-shared";

const NOW = Date.parse("2026-11-12T10:00:00Z");
const hoursFromNow = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const held = (heldUntil: string) => ({ status: "held", held_until: heldUntil });

describe("escrow stages", () => {
  it("holds funds for 1 day after payment", () => {
    expect(ESCROW_HOLD_HOURS).toBe(24);
    expect(escrowStage(held(hoursFromNow(5)), "service", "completed", NOW)).toBe("holding");
    expect(escrowStage(held(hoursFromNow(5)), "product", "completed", NOW)).toBe("holding");
  });

  it("never releases a service automatically: it waits for the client, then for the admin", () => {
    expect(escrowStage(held(hoursFromNow(-1)), "service", "in_progress", NOW)).toBe(
      "waiting_delivery",
    );
    expect(escrowStage(held(hoursFromNow(-1)), "service", "delivered", NOW)).toBe(
      "waiting_delivery",
    );
    expect(escrowStage(held(hoursFromNow(-1)), "service", "completed", NOW)).toBe(
      "ready_for_admin",
    );
  });

  it("lets purchased works become available by themselves after the hold", () => {
    expect(escrowStage(held(hoursFromNow(-1)), "product", "completed", NOW)).toBe("auto_available");
  });

  it("keeps frozen, released and refunded funds out of the normal flow", () => {
    const past = hoursFromNow(-48);
    expect(escrowStage({ status: "frozen", held_until: past }, "service", "completed", NOW)).toBe(
      "frozen",
    );
    expect(escrowStage({ status: "released", held_until: past }, "service", "completed", NOW)).toBe(
      "released",
    );
    expect(escrowStage({ status: "refunded", held_until: past }, "product", "completed", NOW)).toBe(
      "refunded",
    );
  });
});
