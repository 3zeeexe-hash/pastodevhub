import { describe, expect, it } from "vitest";
import {
  addDaysISO, autoReleaseAt, canRequestRevision, finishDateError, formatDuration, hoursBetween, isAutoReleaseDue, revisionsLeft, timeToMinutes, todayWIB,
} from "./work-deadline";

describe("tanggal WIB", () => {
  it("todayWIB memakai tanggal Jakarta, bukan UTC", () => {
    expect(todayWIB(new Date("2026-11-14T18:00:00Z"))).toBe("2026-11-15"); // 01:00 WIB
    expect(todayWIB(new Date("2026-11-14T16:59:00Z"))).toBe("2026-11-14"); // 23:59 WIB
  });
  it("addDaysISO melewati pergantian bulan dan tahun", () => {
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-02-27", 2)).toBe("2026-03-01");
  });
});

describe("pelepasan dana otomatis (H+1 setelah tenggat)", () => {
  it("batas = akhir hari tenggat+1 di WIB", () => {
    // tenggat 10 Nov -> client punya sampai 11 Nov 23:59:59 WIB = 11 Nov 16:59:59 UTC
    expect(autoReleaseAt("2026-11-10", null).toISOString()).toBe("2026-11-11T17:00:00.000Z");
  });
  it("pengiriman telat tetap memberi client 24 jam", () => {
    const lateSub = "2026-11-12T10:00:00Z";
    expect(autoReleaseAt("2026-11-10", lateSub).toISOString()).toBe("2026-11-13T10:00:00.000Z");
  });
  it("belum jatuh tempo saat tenggat+1 masih berjalan", () => {
    const m = { status: "submitted", deadline: "2026-11-10" };
    expect(isAutoReleaseDue(m, "2026-11-09T05:00:00Z", new Date("2026-11-11T16:00:00Z"))).toBe(false);
    expect(isAutoReleaseDue(m, "2026-11-09T05:00:00Z", new Date("2026-11-11T17:00:00Z"))).toBe(true);
  });
  it("hanya untuk hasil yang sudah dikirim dan menunggu client", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    for (const status of ["funded", "in_progress", "revision_requested", "approved", "released", "disputed"]) {
      expect(isAutoReleaseDue({ status, deadline: "2026-11-10" }, "2026-11-09T05:00:00Z", now)).toBe(false);
    }
    expect(isAutoReleaseDue({ status: "submitted", deadline: null }, "2026-11-09T05:00:00Z", now)).toBe(false);
    expect(isAutoReleaseDue({ status: "submitted", deadline: "2026-11-10" }, null, now)).toBe(false);
  });
});

describe("batas revisi", () => {
  it("null = tanpa batas", () => {
    expect(revisionsLeft(null, 5)).toBeNull();
    expect(canRequestRevision(null, 99)).toBe(true);
  });
  it("menghitung sisa dan menolak saat habis", () => {
    expect(revisionsLeft(2, 0)).toBe(2);
    expect(revisionsLeft(2, 2)).toBe(0);
    expect(revisionsLeft(2, 5)).toBe(0);
    expect(canRequestRevision(2, 1)).toBe(true);
    expect(canRequestRevision(2, 2)).toBe(false);
    expect(canRequestRevision(0, 0)).toBe(false);
  });
});

describe("tanggal selesai usulan freelancer", () => {
  const today = "2026-11-14";
  it("wajib untuk kerja langsung", () => {
    expect(finishDateError("", null, true, today)).toMatch(/Pilih tanggal/);
    expect(finishDateError("", null, false, today)).toBe("");
  });
  it("tidak boleh lampau", () => {
    expect(finishDateError("2026-11-13", null, true, today)).toMatch(/masa lalu/);
    expect(finishDateError("2026-11-14", null, true, today)).toBe("");
  });
  it("tidak boleh melewati tanggal client", () => {
    expect(finishDateError("2026-12-02", "2026-12-01", true, today)).toMatch(/client/);
    expect(finishDateError("2026-12-01", "2026-12-01", true, today)).toBe("");
  });
});

describe("jam kerja dari jam mulai dan selesai", () => {
  it("menghitung selisih", () => {
    expect(hoursBetween("09:00", "11:30")).toBe(2.5);
    expect(hoursBetween("08:15", "08:45")).toBe(0.5);
  });
  it("menolak selesai <= mulai atau format salah", () => {
    expect(hoursBetween("10:00", "10:00")).toBeNull();
    expect(hoursBetween("11:00", "09:00")).toBeNull();
    expect(hoursBetween("9:00", "10:00")).toBeNull();
    expect(hoursBetween("24:00", "25:00")).toBeNull();
    expect(timeToMinutes("23:59")).toBe(1439);
  });
  it("format durasi", () => {
    expect(formatDuration(2.5)).toBe("2 jam 30 menit");
    expect(formatDuration(1)).toBe("1 jam");
    expect(formatDuration(0.25)).toBe("15 menit");
  });
});
