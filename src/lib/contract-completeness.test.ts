import { describe, expect, it } from "vitest";
import { contractMissing, type ContractTermsView } from "./contract-completeness";

const today = "2026-11-14";
const full: ContractTermsView = {
  scope: "Membuat website toko online lengkap dengan katalog dan keranjang.",
  revision_terms: "Maksimal 2 kali revisi.",
  usage_rights: "Hak cipta dan kode sumber pindah ke client setelah lunas.",
  cancellation_terms: "Pembatalan sebelum mulai: dana kembali penuh.",
  payment_terms: "Dibayar lewat Midtrans, ditahan escrow.",
  deadline: "2026-12-01", payment_type: "fixed", schedule_mode: false,
};

describe("contractMissing", () => {
  it("kontrak lengkap tidak punya yang kurang", () => {
    expect(contractMissing(full, today)).toEqual([]);
  });
  it("semua ketentuan kosong terdeteksi satu per satu", () => {
    const m = contractMissing({ ...full, scope: "", revision_terms: "  ", usage_rights: "", cancellation_terms: null, payment_terms: "" }, today);
    expect(m).toHaveLength(5);
    expect(m.join(" ")).toMatch(/ruang lingkup.*revisi.*hak penggunaan.*pembatalan.*pembayaran/);
  });
  it("terlalu pendek dianggap kurang, tepat batas minimum cukup", () => {
    expect(contractMissing({ ...full, usage_rights: "a".repeat(19) }, today)).toHaveLength(1);
    expect(contractMissing({ ...full, usage_rights: "a".repeat(20) }, today)).toEqual([]);
    expect(contractMissing({ ...full, revision_terms: "a".repeat(9) }, today)).toHaveLength(1);
    expect(contractMissing({ ...full, revision_terms: "a".repeat(10) }, today)).toEqual([]);
  });
  it("spasi dan baris baru di tepi tidak dihitung", () => {
    expect(contractMissing({ ...full, cancellation_terms: `\n  ${"a".repeat(19)}  \n` }, today)).toHaveLength(1);
  });
  it("kerja langsung wajib tanggal selesai yang belum lewat", () => {
    expect(contractMissing({ ...full, deadline: null }, today)).toEqual(["tanggal selesai"]);
    expect(contractMissing({ ...full, deadline: "2026-11-13" }, today)).toEqual(["tanggal selesai (sudah lewat)"]);
    expect(contractMissing({ ...full, deadline: "2026-11-14" }, today)).toEqual([]);
  });
  it("per jam terjadwal dan per jam lama tidak wajib tanggal selesai", () => {
    expect(contractMissing({ ...full, deadline: null, schedule_mode: true }, today)).toEqual([]);
    expect(contractMissing({ ...full, deadline: null, payment_type: "hourly" }, today)).toEqual([]);
  });
});
