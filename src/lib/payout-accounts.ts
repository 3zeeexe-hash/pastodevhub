import { useQuery, useQueryClient } from "@tanstack/react-query";
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";

/**
 * Rekening pencairan tersimpan (menu Saldo & penarikan). Disimpan di tabel `payout_accounts`
 * (docs/sql/saldo/001_rekening_pencairan.sql). Selama tabel itu belum ada, daftar disimpan di localStorage perangkat
 * supaya menu tetap berfungsi; `local` bernilai true pada keadaan itu.
 */
export type PayoutAccount = { id: string; bank_name: string; account_number: string; account_name: string; is_default: boolean };
export type PayoutAccountInput = { bank_name: string; account_number: string; account_name: string; is_default?: boolean };

export const MAX_PAYOUT_ACCOUNTS = 5;
export const BANK_PRESETS = ["BCA", "Mandiri", "BNI", "BRI", "BSI", "CIMB Niaga", "Permata", "Jago", "SeaBank", "DANA", "OVO", "GoPay", "ShopeePay", "LinkAja"] as const;

const lsKey = (uid: string) => `pastodev-payout-accounts:${uid}`;

function readLocal(uid: string): PayoutAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(lsKey(uid));
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as PayoutAccount[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(uid: string, rows: PayoutAccount[]) {
  try {
    window.localStorage.setItem(lsKey(uid), JSON.stringify(rows));
  } catch {
    /* penyimpanan diblokir: daftar tidak tersimpan */
  }
}

const sortRows = (rows: PayoutAccount[]) => [...rows].sort((a, b) => Number(b.is_default) - Number(a.is_default));

/** Pesan galat untuk isian rekening, atau null kalau sudah benar. */
export function validateAccount(a: PayoutAccountInput): string | null {
  if (a.bank_name.trim().length < 2) return "Isi nama bank atau e-wallet.";
  if (!/^\d{5,25}$/.test(a.account_number.trim())) return "Nomor rekening harus berupa angka 5 sampai 25 digit.";
  if (a.account_name.trim().length < 2) return "Isi nama pemilik rekening.";
  return null;
}

/** Nomor rekening disamarkan, hanya 4 digit terakhir yang terlihat. */
export function maskNumber(n: string): string {
  return n.length <= 4 ? n : `${"•".repeat(Math.min(n.length - 4, 8))}${n.slice(-4)}`;
}

export function usePayoutAccounts(userId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["payout-accounts", userId];
  const q = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await looseDb.from("payout_accounts").select("id,bank_name,account_number,account_name,is_default").eq("user_id", userId!).order("created_at", { ascending: false });
      if (!error) return { rows: sortRows((data ?? []) as PayoutAccount[]), local: false };
      return { rows: sortRows(readLocal(userId!)), local: true };
    },
  });
  const rows = q.data?.rows ?? [];
  const local = q.data?.local ?? false;
  const refresh = () => qc.invalidateQueries({ queryKey });

  /** Mengembalikan pesan galat, atau null kalau berhasil. */
  async function add(input: PayoutAccountInput): Promise<string | null> {
    if (!userId) return "Masuk dulu.";
    const invalid = validateAccount(input);
    if (invalid) return invalid;
    if (rows.length >= MAX_PAYOUT_ACCOUNTS) return `Maksimal ${MAX_PAYOUT_ACCOUNTS} rekening. Hapus salah satu dulu.`;
    const clean = { bank_name: input.bank_name.trim(), account_number: input.account_number.trim(), account_name: input.account_name.trim() };
    if (rows.some((r) => r.bank_name.toLowerCase() === clean.bank_name.toLowerCase() && r.account_number === clean.account_number)) return "Rekening ini sudah tersimpan.";
    const asDefault = !!input.is_default || rows.length === 0;
    if (local) {
      const base = asDefault ? rows.map((r) => ({ ...r, is_default: false })) : rows;
      writeLocal(userId, [...base, { id: crypto.randomUUID(), ...clean, is_default: asDefault }]);
      await refresh();
      return null;
    }
    if (asDefault && rows.length) {
      const r = await looseDb.from("payout_accounts").update({ is_default: false }).eq("user_id", userId);
      if (r.error) return errMsg(r.error);
    }
    const { error } = await looseDb.from("payout_accounts").insert({ user_id: userId, ...clean, is_default: asDefault });
    await refresh();
    return error ? errMsg(error) : null;
  }

  async function makeDefault(id: string): Promise<string | null> {
    if (!userId) return "Masuk dulu.";
    if (local) {
      writeLocal(userId, rows.map((r) => ({ ...r, is_default: r.id === id })));
      await refresh();
      return null;
    }
    const a = await looseDb.from("payout_accounts").update({ is_default: false }).eq("user_id", userId);
    if (a.error) return errMsg(a.error);
    const b = await looseDb.from("payout_accounts").update({ is_default: true }).eq("user_id", userId).eq("id", id);
    await refresh();
    return b.error ? errMsg(b.error) : null;
  }

  async function remove(id: string): Promise<string | null> {
    if (!userId) return "Masuk dulu.";
    const gone = rows.find((r) => r.id === id);
    const rest = rows.filter((r) => r.id !== id);
    const needDefault = !!gone?.is_default && rest.length > 0;
    if (local) {
      writeLocal(userId, rest.map((r, i) => (needDefault ? { ...r, is_default: i === 0 } : r)));
      await refresh();
      return null;
    }
    const { error } = await looseDb.from("payout_accounts").delete().eq("user_id", userId).eq("id", id);
    if (error) return errMsg(error);
    if (needDefault) await looseDb.from("payout_accounts").update({ is_default: true }).eq("user_id", userId).eq("id", rest[0]!.id);
    await refresh();
    return null;
  }

  return { accounts: rows, isLoading: q.isLoading, local, add, makeDefault, remove };
}
