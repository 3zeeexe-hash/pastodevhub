import { describe, expect, it } from "vitest";
import { formatRupiah, orderActions, safeUrl, sellerEarning } from "@/lib/market";

const order = (status: Parameters<typeof orderActions>[0]["status"], kind: "product" | "service" = "service") =>
  ({ kind, status, buyer_id: "client", seller_id: "dev" });
const client = { id: "client", isAdmin: false };
const dev = { id: "dev", isAdmin: false };
const admin = { id: "admin", isAdmin: true };

describe("marketplace rules", () => {
  it("shows free works as Gratis and paid works in rupiah", () => {
    expect(formatRupiah(0)).toBe("Gratis");
    expect(formatRupiah(150000)).toBe("Rp150.000");
  });

  it("lets only the developer accept or decline a service request", () => {
    expect(orderActions(order("requested"), dev)).toEqual(["accept", "decline"]);
    expect(orderActions(order("requested"), client)).toEqual(["cancel"]);
  });

  it("lets only the client pay, and only admin verify payment", () => {
    expect(orderActions(order("awaiting_payment"), client)).toContain("pay");
    expect(orderActions(order("awaiting_payment"), dev)).toEqual([]);
    expect(orderActions(order("payment_review"), admin)).toEqual(["verify"]);
    expect(orderActions(order("payment_review"), client)).toEqual([]);
  });

  it("developer delivers, client completes or asks for revision", () => {
    expect(orderActions(order("in_progress"), dev)).toEqual(["deliver"]);
    expect(orderActions(order("delivered"), client)).toEqual(["complete", "revise"]);
    expect(orderActions(order("completed"), client)).toEqual([]);
  });

  it("subtracts the platform fee from developer earnings", () => {
    expect(sellerEarning(100000, 0)).toBe(100000);
    expect(sellerEarning(100000, 10)).toBe(90000);
  });

  it("rejects non-web profile links", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://github.com/x")).toBe("https://github.com/x");
  });
});
