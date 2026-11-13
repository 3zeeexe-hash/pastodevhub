import { describe, expect, it } from "vitest";
import {
  calcCommission, canMilestoneMove, contractIsActive, milestoneActions, milestonesMatchTotal,
  timesheetSummary, validAmount, validTimesheetEntry,
} from "./work";

describe("komisi", () => {
  it("Rp2.000.000 dengan komisi 5% = Rp100.000, freelancer Rp1.900.000", () => {
    expect(calcCommission(2_000_000, 5)).toEqual({ fee: 100_000, net: 1_900_000 });
  });
  it("menolak nominal atau persen tidak valid", () => {
    expect(() => calcCommission(-1, 5)).toThrow();
    expect(() => calcCommission(1000.5, 5)).toThrow();
    expect(() => calcCommission(1000, 51)).toThrow();
    expect(() => calcCommission(1000, Number.NaN)).toThrow();
  });
});

describe("milestone", () => {
  it("contoh proyek website Rp2.000.000 cocok dengan total", () => {
    const ms = [500_000, 700_000, 500_000, 300_000].map((amount) => ({ amount }));
    expect(milestonesMatchTotal(2_000_000, ms)).toBe(true);
    expect(milestonesMatchTotal(2_100_000, ms)).toBe(false);
  });
  it("milestone dibatalkan tidak dihitung, dan daftar kosong ditolak", () => {
    expect(milestonesMatchTotal(1000, [{ amount: 1000 }, { amount: 500, status: "cancelled" }])).toBe(true);
    expect(milestonesMatchTotal(1000, [])).toBe(false);
  });
  it("nominal harus bilangan bulat positif", () => {
    expect(validAmount(0)).toBe(false);
    expect(validAmount(1.5)).toBe(false);
    expect(validAmount(500_000)).toBe(true);
  });
  it("alur status: dana hanya dari menunggu bayar, rilis hanya dari disetujui", () => {
    expect(canMilestoneMove("awaiting_payment", "funded")).toBe(true);
    expect(canMilestoneMove("pending", "funded")).toBe(false);
    expect(canMilestoneMove("submitted", "released")).toBe(false);
    expect(canMilestoneMove("approved", "released")).toBe(true);
    expect(canMilestoneMove("released", "in_progress")).toBe(false);
  });
});

describe("hak aksi", () => {
  const c = { client_id: "c1", freelancer_id: "f1", status: "active" as const };
  it("hanya pihak yang berhak", () => {
    expect(milestoneActions(c, { status: "funded" }, "f1").start).toBe(true);
    expect(milestoneActions(c, { status: "funded" }, "c1").start).toBe(false);
    expect(milestoneActions(c, { status: "submitted" }, "c1").approve).toBe(true);
    expect(milestoneActions(c, { status: "submitted" }, "f1").approve).toBe(false);
    expect(milestoneActions(c, { status: "submitted" }, "orang-lain").approve).toBe(false);
    expect(milestoneActions(c, { status: "submitted" }, null).approve).toBe(false);
  });
  it("tidak ada aksi jika kontrak belum aktif", () => {
    const draft = { ...c, status: "draft" as const };
    expect(milestoneActions(draft, { status: "funded" }, "f1").start).toBe(false);
  });
  it("kontrak aktif butuh persetujuan kedua pihak", () => {
    expect(contractIsActive({ status: "active", client_approved_at: "2026-01-01", freelancer_approved_at: null })).toBe(false);
    expect(contractIsActive({ status: "active", client_approved_at: "2026-01-01", freelancer_approved_at: "2026-01-02" })).toBe(true);
  });
});

describe("timesheet", () => {
  it("hanya jam yang disetujui yang ditagih", () => {
    const s = timesheetSummary(
      [{ hours: 3, status: "approved" }, { hours: 2.5, status: "approved" }, { hours: 4, status: "submitted" }, { hours: 1, status: "rejected" }],
      100_000,
    );
    expect(s).toEqual({ approvedHours: 5.5, pendingHours: 4, rejectedHours: 1, billable: 550_000 });
  });
  it("validasi tanggal dan jam", () => {
    const now = new Date(2026, 10, 13);
    expect(validTimesheetEntry(new Date(2026, 10, 12), 8, now)).toBe(true);
    expect(validTimesheetEntry(new Date(2026, 10, 14), 8, now)).toBe(false);
    expect(validTimesheetEntry(new Date(2026, 8, 1), 8, now)).toBe(false);
    expect(validTimesheetEntry(new Date(2026, 10, 12), 0, now)).toBe(false);
    expect(validTimesheetEntry(new Date(2026, 10, 12), 25, now)).toBe(false);
  });
});
