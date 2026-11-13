// GOBI WORK Fase 6: pembantu murni untuk halaman admin kerja (diuji di admin-work.test.ts).

/** Hanya tautan http(s) yang boleh dijadikan <a>. Skema lain (javascript:, data:, dst.) ditolak. */
export function safeHttpUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type EvidenceItem = { label: string; url: string | null };

/** Bukti sengketa disimpan sebagai jsonb bebas bentuk: normalkan menjadi daftar label + tautan aman. */
export function evidenceItems(raw: unknown): EvidenceItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).map((x): EvidenceItem => {
    if (typeof x === "string") return { label: x.slice(0, 300), url: safeHttpUrl(x) };
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const url = safeHttpUrl(o.url ?? o.link);
      const name = typeof o.name === "string" ? o.name : typeof o.label === "string" ? o.label : null;
      return { label: (name ?? url ?? JSON.stringify(o)).slice(0, 300), url };
    }
    return { label: String(x).slice(0, 300), url: null };
  });
}

export type EscrowInfo = { fee: number; net: number; status: string };

/** PostgREST mengembalikan relasi satu-ke-satu sebagai objek atau larik tergantung skema: terima keduanya. */
export function pickEscrow(e: unknown): EscrowInfo | null {
  const row = Array.isArray(e) ? e[0] : e;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.status !== "string") return null;
  return { fee: Number(r.fee ?? 0), net: Number(r.net ?? 0), status: r.status };
}

export type TxSummaryInput = { amount: number; paid_at: string | null; fee: number; needsRefund: boolean };

/** Volume dan komisi hanya dihitung dari pesanan yang benar-benar sudah dibayar (paid_at terisi oleh server). */
export function summarizeTx(rows: TxSummaryInput[]) {
  let volume = 0, commission = 0, paid = 0, refund = 0;
  for (const r of rows) {
    if (r.paid_at) {
      paid += 1;
      volume += Number(r.amount) || 0;
      commission += Number(r.fee) || 0;
    }
    if (r.needsRefund) refund += 1;
  }
  return { volume, commission, paid, refund };
}
