// Server functions for Midtrans payments (buyer) and Midtrans settings (admin).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Khusus admin.");
}

const METHOD_ENUM = z.enum(["bca", "bni", "bri", "permata", "qris"]);

// ---------- Buyer ----------

/** Non-secret info the payment pop-up needs. */
export const getMidtransPublicInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getMidtransConfig } = await import("@/lib/midtrans.server");
    const c = await getMidtransConfig();
    return { enabled: c.enabled && !!c.serverKey, mode: c.mode, methods: c.methods };
  });

export const createMidtransCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; method: string }) =>
    z.object({ orderId: z.string().uuid(), method: METHOD_ENUM }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/midtrans.server");
    const cfg = await m.getMidtransConfig();
    if (!cfg.enabled || !cfg.serverKey) throw new Error("Pembayaran Midtrans belum aktif. Hubungi admin.");
    if (!cfg.methods.includes(data.method)) throw new Error("Metode pembayaran ini tidak tersedia.");
    const active = { mode: cfg.mode, serverKey: cfg.serverKey };

    // Read through the buyer's own session so row-level rules decide who may pay.
    const { data: order, error } = await context.supabase
      .from("orders").select("id,number,title,amount,status,buyer_id").eq("id", data.orderId).maybeSingle();
    if (error || !order) throw new Error("Pesanan tidak ditemukan.");
    if (order.buyer_id !== context.userId) throw new Error("Hanya pembeli yang bisa membayar pesanan ini.");
    if (order.status !== "awaiting_payment") throw new Error("Pesanan ini tidak sedang menunggu pembayaran.");
    if (!order.amount || order.amount < 1000) throw new Error("Nominal pesanan belum valid.");

    const { data: prof } = await context.supabase.from("profiles").select("username,display_name").eq("id", context.userId).maybeSingle();
    const email = (context.claims as Record<string, unknown>)["email"];
    const midtransOrderId = `PD-${order.number}-${Date.now().toString(36).toUpperCase()}`;

    const charge = await m.createCharge(active, {
      midtransOrderId,
      amount: order.amount,
      method: data.method,
      itemName: order.title,
      customerName: prof?.display_name || prof?.username || "Pelanggan",
      customerEmail: typeof email === "string" && email ? email : undefined,
    }, m.notificationUrl());

    let recorded: { id: string; superseded: string[] };
    try {
      recorded = await m.recordCharge({ orderId: order.id, buyerId: context.userId, midtransOrderId, method: data.method, amount: order.amount, mode: cfg.mode, charge });
    } catch (e) {
      await m.cancelTransaction(active, midtransOrderId); // do not leave an unrecorded payable transaction behind
      throw e;
    }
    for (const old of recorded.superseded ?? []) await m.cancelTransaction(active, old);

    return {
      paymentId: recorded.id,
      method: data.method,
      vaNumber: charge.vaNumber,
      bank: charge.bank,
      qrUrl: charge.qrUrl,
      expiresAt: charge.expiresAt,
      amount: order.amount,
    };
  });

/**
 * Asks Midtrans for the real status of this order's open attempts and applies it, same as the callback.
 * The pop-up polls this so payment is picked up even if the notification is slow or cannot reach the site.
 */
export const syncMidtransPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/midtrans.server");
    const cfg = await m.getMidtransConfig();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows } = await sb.from("payments").select("midtrans_order_id")
      .eq("order_id", data.orderId).in("status", ["pending", "superseded"]).order("created_at", { ascending: false }).limit(3);
    if (cfg.serverKey && Array.isArray(rows)) {
      const active = { mode: cfg.mode, serverKey: cfg.serverKey };
      for (const r of rows as { midtrans_order_id: string }[]) {
        const st = await m.fetchStatus(active, r.midtrans_order_id);
        if (!st.found) continue;
        await m.applyNotification({
          midtransOrderId: r.midtrans_order_id,
          transactionStatus: String(st.data["transaction_status"] ?? ""),
          fraudStatus: st.data["fraud_status"] ? String(st.data["fraud_status"]) : null,
          grossAmount: Number(st.data["gross_amount"]),
          paymentType: st.data["payment_type"] ? String(st.data["payment_type"]) : null,
          raw: st.data,
        });
      }
    }
    const { data: order } = await context.supabase.from("orders").select("status").eq("id", data.orderId).maybeSingle();
    return { orderStatus: order?.status ?? null };
  });

// ---------- Admin ----------

export const getAdminMidtransSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const m = await import("@/lib/midtrans.server");
    return { ...(await m.readMidtransSettingsForAdmin()), notificationUrl: m.notificationUrl() };
  });

const keyField = (re: RegExp, msg: string) => z.string().trim().max(200).regex(re, msg);

export const saveAdminMidtransSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    enabled: boolean; mode: string; methods: string[];
    sandboxServerKey: string; sandboxClientKey: string; productionServerKey: string; productionClientKey: string;
  }) =>
    z.object({
      enabled: z.boolean(),
      mode: z.enum(["sandbox", "production"]),
      methods: z.array(METHOD_ENUM).max(10),
      sandboxServerKey: keyField(/^(SB-Mid-server-[A-Za-z0-9_-]+)?$/, "Server key sandbox harus diawali SB-Mid-server-"),
      sandboxClientKey: keyField(/^(SB-Mid-client-[A-Za-z0-9_-]+)?$/, "Client key sandbox harus diawali SB-Mid-client-"),
      productionServerKey: keyField(/^(Mid-server-[A-Za-z0-9_-]+)?$/, "Server key produksi harus diawali Mid-server-"),
      productionClientKey: keyField(/^(Mid-client-[A-Za-z0-9_-]+)?$/, "Client key produksi harus diawali Mid-client-"),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const m = await import("@/lib/midtrans.server");
    const current = await m.readMidtransSettingsForAdmin();
    if (!current.schemaReady) throw new Error("Database belum siap. Jalankan docs/sql/midtrans-escrow/001_midtrans_escrow.sql dulu.");
    const hasKey = data.mode === "production"
      ? current.hasProductionKey || !!data.productionServerKey
      : current.hasSandboxKey || !!data.sandboxServerKey;
    if (data.enabled && !hasKey) throw new Error(`Isi Server Key mode ${data.mode === "production" ? "produksi" : "sandbox"} dulu sebelum mengaktifkan.`);
    if (data.enabled && data.methods.length === 0) throw new Error("Pilih minimal satu metode pembayaran.");
    await m.writeMidtransSettings(data);
    // Never log key values; only the non-secret summary.
    await context.supabase.rpc("admin_log_event" as never, {
      _action: "midtrans_settings", _target_type: "settings", _target_id: "midtrans",
      _note: `aktif=${data.enabled}, mode=${data.mode}, metode=${data.methods.join(",")}`,
    } as never).then(() => undefined, () => undefined);
    return { ok: true };
  });

export const testAdminMidtrans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mode: string }) => z.object({ mode: z.enum(["sandbox", "production"]) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const m = await import("@/lib/midtrans.server");
    const key = await m.readServerKeyForMode(data.mode);
    if (!key) throw new Error(`Server key ${data.mode === "production" ? "produksi" : "sandbox"} belum disimpan.`);
    // A valid key answers "transaction not found" (404); a wrong key answers 401.
    await m.fetchStatus({ mode: data.mode, serverKey: key }, `PD-TEST-${Date.now().toString(36)}`);
    return { ok: true };
  });
