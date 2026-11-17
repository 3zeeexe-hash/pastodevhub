import { describe, expect, it } from "vitest";
import { computeFee, emptyFees, feeRuleLabel, normalizeFees } from "./midtrans-shared";

describe("computeFee", () => {
  it("VA: biaya tetap Rp4.000 tidak bergantung nominal", () => {
    expect(computeFee({ flat: 4000, percent: 0 }, 50_000)).toBe(4000);
    expect(computeFee({ flat: 4000, percent: 0 }, 2_000_000)).toBe(4000);
  });

  it("QRIS: 0,7% dari nominal, tepat tanpa selisih desimal", () => {
    expect(computeFee({ flat: 0, percent: 0.7 }, 100_000)).toBe(700);
    expect(computeFee({ flat: 0, percent: 0.7 }, 1_000_000)).toBe(7000);
  });

  it("membulatkan persen ke atas ke rupiah penuh", () => {
    expect(computeFee({ flat: 0, percent: 0.7 }, 12_345)).toBe(87); // 86,415
  });

  it("menggabungkan biaya tetap dan persen", () => {
    expect(computeFee({ flat: 2000, percent: 0.7 }, 100_000)).toBe(2700);
  });

  it("tanpa aturan, nominal nol, atau nominal tidak valid = tanpa biaya", () => {
    expect(computeFee(undefined, 100_000)).toBe(0);
    expect(computeFee({ flat: 4000, percent: 1 }, 0)).toBe(0);
    expect(computeFee({ flat: 4000, percent: 1 }, Number.NaN)).toBe(0);
  });

  it("membatasi nilai berlebihan dan menolak angka negatif", () => {
    expect(computeFee({ flat: -5000, percent: -1 }, 100_000)).toBe(0);
    expect(computeFee({ flat: 0, percent: 99 }, 100_000)).toBe(10_000); // maksimal 10%
  });
});

describe("normalizeFees", () => {
  it("data kosong atau rusak = semua metode tanpa biaya", () => {
    expect(normalizeFees(null)).toEqual(emptyFees());
    expect(normalizeFees("x")).toEqual(emptyFees());
    expect(normalizeFees({ bca: "x", qris: { flat: "abc" } })).toEqual(emptyFees());
  });

  it("membaca aturan per metode dan mengabaikan metode tak dikenal", () => {
    const f = normalizeFees({ bca: { flat: 4000, percent: 0 }, qris: { flat: 0, percent: 0.7 }, dana: { flat: 1, percent: 1 } });
    expect(f.bca).toEqual({ flat: 4000, percent: 0 });
    expect(f.qris).toEqual({ flat: 0, percent: 0.7 });
    expect(f).not.toHaveProperty("dana");
  });
});

describe("feeRuleLabel", () => {
  it("menampilkan teks yang mudah dibaca", () => {
    expect(feeRuleLabel({ flat: 4000, percent: 0 })).toBe("Rp4.000");
    expect(feeRuleLabel({ flat: 0, percent: 0.7 })).toBe("0,7%");
    expect(feeRuleLabel({ flat: 2000, percent: 0.7 })).toBe("Rp2.000 + 0,7%");
    expect(feeRuleLabel({ flat: 0, percent: 0 })).toBe("Gratis");
  });
});
