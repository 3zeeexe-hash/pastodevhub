// Midtrans payment notification (callback). Public endpoint: trusted only after the signature is
// valid AND Midtrans itself confirms the status (server-to-server), then applied idempotently.
//
// Sesuai dokumentasi Midtrans, endpoint notifikasi HARUS membalas HTTP 200 setelah notifikasi diterima.
// Karena itu notifikasi yang tidak bisa dipakai (JSON rusak, belum dikonfigurasi, signature tidak cocok,
// transaksi tidak dikenal) tetap dibalas 200 dan dilewati tanpa mengubah data apa pun. Hanya kegagalan
// pemrosesan sungguhan (database / API Midtrans bermasalah) yang dibalas 500 supaya Midtrans mengirim ulang
// dan pembayaran yang sah tidak hilang.
import { createFileRoute } from "@tanstack/react-router";
import type { MidtransMode } from "@/lib/midtrans-shared";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Balasan 200 untuk notifikasi yang diterima tapi tidak diproses. */
function ack(ignored: string) {
  return json({ ok: true, ignored });
}

type Candidate = { mode: MidtransMode; serverKey: string };

/**
 * Semua server key yang mungkin dipakai Midtrans untuk menandatangani notifikasi: mode aktif lebih dulu,
 * lalu key sandbox & produksi yang tersimpan, lalu key dari env. Dengan begitu notifikasi dari dashboard
 * sandbox tetap terverifikasi walau mode situs sedang produksi (dan sebaliknya).
 */
async function candidateKeys(): Promise<Candidate[]> {
  const m = await import("@/lib/midtrans.server");
  const out: Candidate[] = [];
  const add = (mode: MidtransMode, serverKey: string | null | undefined) => {
    if (serverKey && !out.some((c) => c.mode === mode && c.serverKey === serverKey)) out.push({ mode, serverKey });
  };
  try {
    const cfg = await m.getMidtransConfig();
    add(cfg.mode, cfg.serverKey);
  } catch (e) {
    console.error("Midtrans notification: reading active config failed", e);
  }
  for (const mode of ["sandbox", "production"] as const) {
    try {
      add(mode, await m.readServerKeyForMode(mode));
    } catch (e) {
      console.error(`Midtrans notification: reading ${mode} key failed`, e);
    }
  }
  add(process.env["MIDTRANS_IS_PRODUCTION"] === "true" ? "production" : "sandbox", process.env["MIDTRANS_SERVER_KEY"]);
  return out;
}

export const Route = createFileRoute("/api/midtrans/notification")({
  server: {
    handlers: {
      GET: async () => json({ ok: true, service: "midtrans-notification" }),
      POST: async ({ request }) => {
        let parsed: unknown;
        try {
          parsed = await request.json();
        } catch {
          return ack("invalid json");
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return ack("invalid body");
        const body = parsed as Record<string, unknown>;

        const orderId = typeof body["order_id"] === "string" ? body["order_id"] : "";
        if (!orderId || orderId.length > 100) return ack("invalid order_id");

        try {
          const m = await import("@/lib/midtrans.server");
          const keys = await candidateKeys();
          if (keys.length === 0) {
            console.warn("Midtrans notification ignored: no server key configured", orderId);
            return ack("not configured");
          }
          // Signature palsu / key tidak cocok: tidak diproses sama sekali, tetap dibalas 200.
          const match = keys.find((c) => m.verifySignature(body, c.serverKey));
          if (!match) {
            console.warn("Midtrans notification ignored: signature does not match any server key", orderId);
            return ack("signature mismatch");
          }

          const st = await m.fetchStatus({ mode: match.mode, serverKey: match.serverKey }, orderId);
          // Valid signature but unknown transaction (e.g. the dashboard's "test notification"): acknowledge, do nothing.
          if (!st.found) return ack("transaction not found");

          const result = await m.applyNotification({
            midtransOrderId: orderId,
            transactionStatus: String(st.data["transaction_status"] ?? ""),
            fraudStatus: st.data["fraud_status"] ? String(st.data["fraud_status"]) : null,
            grossAmount: Number(st.data["gross_amount"]),
            paymentType: st.data["payment_type"] ? String(st.data["payment_type"]) : null,
            raw: st.data,
          });
          return json({ ok: true, result });
        } catch (e) {
          // Signature sudah valid tapi pemrosesan gagal: balas 5xx supaya Midtrans mengirim ulang nanti.
          console.error("Midtrans notification failed", orderId, e);
          return json({ ok: false, error: "processing failed" }, 500);
        }
      },
    },
  },
});
