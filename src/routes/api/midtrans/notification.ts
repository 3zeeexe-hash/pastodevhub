// Midtrans payment notification (callback). Public endpoint: trusted only after the signature is
// valid AND Midtrans itself confirms the status (server-to-server), then applied idempotently.
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export const Route = createFileRoute("/api/midtrans/notification")({
  server: {
    handlers: {
      GET: async () => json({ ok: true, service: "midtrans-notification" }),
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: "invalid json" }, 400);
        }
        const orderId = typeof body["order_id"] === "string" ? body["order_id"] : "";
        if (!orderId || orderId.length > 100) return json({ ok: false, error: "invalid order_id" }, 400);

        try {
          const m = await import("@/lib/midtrans.server");
          const cfg = await m.getMidtransConfig();
          if (!cfg.serverKey) return json({ ok: false, error: "not configured" }, 503);
          if (!m.verifySignature(body, cfg.serverKey)) return json({ ok: false, error: "invalid signature" }, 403);

          const st = await m.fetchStatus({ mode: cfg.mode, serverKey: cfg.serverKey }, orderId);
          // Valid signature but unknown transaction (e.g. the dashboard's "test notification"): acknowledge, do nothing.
          if (!st.found) return json({ ok: true, ignored: "transaction not found" });

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
          // Non-2xx makes Midtrans retry later.
          console.error("Midtrans notification failed", orderId, e);
          return json({ ok: false, error: "processing failed" }, 500);
        }
      },
    },
  },
});
