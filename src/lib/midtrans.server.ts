// Server-only Midtrans Core API helper. The server key never reaches the browser.
import { createHash, timingSafeEqual } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptConnectionKey, encryptConnectionKey } from "@/lib/connectionKeyCrypto.server";
import { resolveSiteOrigin } from "@/lib/site-url";
import { MIDTRANS_METHOD_IDS, midtransBaseUrl, type MidtransMethodId, type MidtransMode } from "@/lib/midtrans-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = SupabaseClient<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

// Same pattern as platform-secrets.server.ts: publishable key + server proof, no service-role key.
async function db(): Promise<LooseDb> {
  const { serverDb } = await import("@/lib/server-db.server");
  return serverDb() as unknown as LooseDb;
}

const SECRET_COLUMNS =
  "midtrans_enabled,midtrans_mode,midtrans_sandbox_server_key_ciphertext,midtrans_sandbox_client_key,midtrans_production_server_key_ciphertext,midtrans_production_client_key,midtrans_methods,updated_at";

export type MidtransConfig = {
  enabled: boolean;
  mode: MidtransMode;
  serverKey: string | null;
  clientKey: string | null;
  methods: MidtransMethodId[];
  source: "admin" | "env" | "none";
};
export type ActiveConfig = { mode: MidtransMode; serverKey: string };

function cleanMethods(v: unknown): MidtransMethodId[] {
  const arr: unknown[] = Array.isArray(v) ? v : [];
  return MIDTRANS_METHOD_IDS.filter((id) => arr.includes(id));
}

/** Admin panel settings win; MIDTRANS_SERVER_KEY / MIDTRANS_IS_PRODUCTION are the fallback (e.g. self-hosted). */
export async function getMidtransConfig(): Promise<MidtransConfig> {
  try {
    const d = await db();
    const { data, error } = await d.from("platform_secrets").select(SECRET_COLUMNS).eq("id", 1).maybeSingle();
    if (error) throw error;
    const row = data as Obj | null;
    if (row && (row["midtrans_sandbox_server_key_ciphertext"] || row["midtrans_production_server_key_ciphertext"])) {
      const mode: MidtransMode = row["midtrans_mode"] === "production" ? "production" : "sandbox";
      const cipher: string | null = mode === "production" ? row["midtrans_production_server_key_ciphertext"] : row["midtrans_sandbox_server_key_ciphertext"];
      return {
        enabled: !!row["midtrans_enabled"] && !!cipher,
        mode,
        serverKey: cipher ? decryptConnectionKey(cipher) : null,
        clientKey: (mode === "production" ? row["midtrans_production_client_key"] : row["midtrans_sandbox_client_key"]) ?? null,
        methods: cleanMethods(row["midtrans_methods"]),
        source: "admin",
      };
    }
  } catch (e) {
    console.error("Reading Midtrans settings failed", e);
  }
  const envKey = process.env["MIDTRANS_SERVER_KEY"];
  if (envKey) {
    return {
      enabled: true,
      mode: process.env["MIDTRANS_IS_PRODUCTION"] === "true" ? "production" : "sandbox",
      serverKey: envKey,
      clientKey: process.env["MIDTRANS_CLIENT_KEY"] ?? null,
      methods: [...MIDTRANS_METHOD_IDS],
      source: "env",
    };
  }
  return { enabled: false, mode: "sandbox", serverKey: null, clientKey: null, methods: [...MIDTRANS_METHOD_IDS], source: "none" };
}

export type MidtransAdminSettings = {
  schemaReady: boolean;
  schemaError: string | null;
  enabled: boolean;
  mode: MidtransMode;
  methods: MidtransMethodId[];
  hasSandboxKey: boolean;
  hasProductionKey: boolean;
  sandboxClientKey: string;
  productionClientKey: string;
  updatedAt: string | null;
  envFallback: boolean;
};

export async function readMidtransSettingsForAdmin(): Promise<MidtransAdminSettings> {
  const base: MidtransAdminSettings = {
    schemaReady: true, schemaError: null, enabled: false, mode: "sandbox", methods: [...MIDTRANS_METHOD_IDS],
    hasSandboxKey: false, hasProductionKey: false, sandboxClientKey: "", productionClientKey: "", updatedAt: null,
    envFallback: !!process.env["MIDTRANS_SERVER_KEY"],
  };
  const d = await db();
  const { data, error } = await d.from("platform_secrets").select(SECRET_COLUMNS).eq("id", 1).maybeSingle();
  if (error) return { ...base, schemaReady: false, schemaError: error.message };
  const row = data as Obj | null;
  if (!row) return base;
  return {
    ...base,
    enabled: !!row["midtrans_enabled"],
    mode: row["midtrans_mode"] === "production" ? "production" : "sandbox",
    methods: cleanMethods(row["midtrans_methods"]),
    hasSandboxKey: !!row["midtrans_sandbox_server_key_ciphertext"],
    hasProductionKey: !!row["midtrans_production_server_key_ciphertext"],
    sandboxClientKey: row["midtrans_sandbox_client_key"] ?? "",
    productionClientKey: row["midtrans_production_client_key"] ?? "",
    updatedAt: row["updated_at"] ?? null,
  };
}

export type MidtransSettingsInput = {
  enabled: boolean;
  mode: MidtransMode;
  methods: MidtransMethodId[];
  sandboxServerKey: string;
  sandboxClientKey: string;
  productionServerKey: string;
  productionClientKey: string;
};

/** Empty server key = keep the stored one. Keys are AES-encrypted like the other platform secrets. */
export async function writeMidtransSettings(input: MidtransSettingsInput) {
  const d = await db();
  const row: Obj = {
    id: 1,
    updated_at: new Date().toISOString(),
    midtrans_enabled: input.enabled,
    midtrans_mode: input.mode,
    midtrans_methods: input.methods,
    midtrans_sandbox_client_key: input.sandboxClientKey || null,
    midtrans_production_client_key: input.productionClientKey || null,
  };
  if (input.sandboxServerKey) row["midtrans_sandbox_server_key_ciphertext"] = encryptConnectionKey(input.sandboxServerKey);
  if (input.productionServerKey) row["midtrans_production_server_key_ciphertext"] = encryptConnectionKey(input.productionServerKey);
  const { error } = await d.from("platform_secrets").upsert(row);
  if (error) throw new Error(error.message);
}

export async function readServerKeyForMode(mode: MidtransMode): Promise<string | null> {
  const d = await db();
  const col = mode === "production" ? "midtrans_production_server_key_ciphertext" : "midtrans_sandbox_server_key_ciphertext";
  const { data, error } = await d.from("platform_secrets").select(col).eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  const cipher = (data as Obj | null)?.[col] as string | null | undefined;
  return cipher ? decryptConnectionKey(cipher) : null;
}

// ---------- Midtrans HTTP ----------

function basicAuth(serverKey: string) {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

async function call(cfg: ActiveConfig, method: "GET" | "POST", path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Obj> {
  const res = await fetch(`${midtransBaseUrl(cfg.mode)}${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: basicAuth(cfg.serverKey), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const json = (await res.json().catch(() => ({}))) as Obj;
  if (json["status_code"] === undefined) json["status_code"] = String(res.status);
  return json;
}

/** Midtrans timestamps ("2026-11-12 10:30:00") are Western Indonesia Time (+07:00). */
function wibToIso(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const d = new Date(`${s.replace(" ", "T")}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type ChargeInput = {
  midtransOrderId: string;
  amount: number;
  method: MidtransMethodId;
  itemName: string;
  customerName: string;
  customerEmail?: string | undefined;
};

export type ChargeResult = { vaNumber: string | null; bank: string | null; qrUrl: string | null; expiresAt: string; raw: Obj };

/** Core API charge. Every request carries its own notification URL (X-Override-Notification). */
export async function createCharge(cfg: ActiveConfig, input: ChargeInput, notifyUrl: string): Promise<ChargeResult> {
  const amount = Math.round(input.amount);
  const body: Obj = {
    transaction_details: { order_id: input.midtransOrderId, gross_amount: amount },
    item_details: [{ id: "pesanan", price: amount, quantity: 1, name: input.itemName.slice(0, 50) || "Pesanan Pastodev" }],
    customer_details: { first_name: input.customerName.slice(0, 50) || "Pelanggan", ...(input.customerEmail ? { email: input.customerEmail } : {}) },
  };
  let minutes = 24 * 60;
  if (input.method === "qris") {
    body["payment_type"] = "qris";
    body["qris"] = { acquirer: "gopay" };
    body["custom_expiry"] = { expiry_duration: 30, unit: "minute" };
    minutes = 30;
  } else {
    body["payment_type"] = "bank_transfer";
    body["bank_transfer"] = { bank: input.method };
    body["custom_expiry"] = { expiry_duration: 24, unit: "hour" };
  }
  const j = await call(cfg, "POST", "/v2/charge", body, { "X-Override-Notification": notifyUrl });
  if (!["200", "201"].includes(String(j["status_code"]))) {
    throw new Error(`Midtrans: ${j["status_message"] ?? j["error_messages"] ?? "gagal membuat pembayaran"}`);
  }
  const va: string | null = j["va_numbers"]?.[0]?.va_number ?? j["permata_va_number"] ?? null;
  const bank: string | null = j["va_numbers"]?.[0]?.bank ?? (j["permata_va_number"] ? "permata" : null);
  const qr: string | null = (j["actions"] as Obj[] | undefined)?.find((a) => a["name"] === "generate-qr-code")?.["url"] ?? null;
  if (input.method === "qris" ? !qr : !va) throw new Error("Midtrans tidak mengembalikan kode pembayaran.");
  return {
    vaNumber: va,
    bank,
    qrUrl: qr,
    expiresAt: wibToIso(j["expiry_time"]) ?? new Date(Date.now() + minutes * 60_000).toISOString(),
    raw: j,
  };
}

export async function fetchStatus(cfg: ActiveConfig, midtransOrderId: string): Promise<{ found: false } | { found: true; data: Obj }> {
  const j = await call(cfg, "GET", `/v2/${encodeURIComponent(midtransOrderId)}/status`);
  const code = String(j["status_code"]);
  if (code === "404") return { found: false };
  if (code === "401") throw new Error("Server key Midtrans ditolak. Periksa key dan modenya (sandbox/produksi).");
  return { found: true, data: j };
}

/** Best effort: stop an old pending attempt so it cannot be paid by mistake. */
export async function cancelTransaction(cfg: ActiveConfig, midtransOrderId: string) {
  try {
    await call(cfg, "POST", `/v2/${encodeURIComponent(midtransOrderId)}/cancel`);
  } catch (e) {
    console.error("Midtrans cancel failed", midtransOrderId, e);
  }
}

/** signature_key = SHA512(order_id + status_code + gross_amount + ServerKey). */
export function verifySignature(body: Record<string, unknown>, serverKey: string): boolean {
  const { order_id, status_code, gross_amount, signature_key } = body;
  if (![order_id, status_code, gross_amount, signature_key].every((v) => typeof v === "string" && v.length > 0)) return false;
  const expected = Buffer.from(createHash("sha512").update(`${order_id}${status_code}${gross_amount}${serverKey}`).digest("hex"));
  const given = Buffer.from(String(signature_key));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ---------- Database (through the server proof) ----------

export async function recordCharge(p: {
  orderId: string; buyerId: string; midtransOrderId: string; method: string; amount: number; mode: MidtransMode; charge: ChargeResult;
}): Promise<{ id: string; superseded: string[] }> {
  const d = await db();
  const { data, error } = await d.rpc("midtrans_record_charge", {
    _order_id: p.orderId,
    _buyer_id: p.buyerId,
    _midtrans_order_id: p.midtransOrderId,
    _method: p.method,
    _amount: Math.round(p.amount),
    _mode: p.mode,
    _va: p.charge.vaNumber,
    _bank: p.charge.bank,
    _qr: p.charge.qrUrl,
    _expires: p.charge.expiresAt,
    _raw: p.charge.raw,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; superseded: string[] };
}

export async function applyNotification(p: {
  midtransOrderId: string; transactionStatus: string; fraudStatus: string | null; grossAmount: number; paymentType: string | null; raw: unknown;
}): Promise<string> {
  const d = await db();
  const { data, error } = await d.rpc("midtrans_apply_notification", {
    _midtrans_order_id: p.midtransOrderId,
    _transaction_status: p.transactionStatus,
    _fraud_status: p.fraudStatus,
    _gross_amount: p.grossAmount,
    _payment_type: p.paymentType,
    _raw: p.raw,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

// ---------- URLs ----------

export function siteOrigin(): string {
  const request = getRequest();
  if (!request) throw new Error("Request tidak tersedia.");
  const url = new URL(request.url);
  const forwarded = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  return resolveSiteOrigin(process.env["SITE_URL"], forwarded ? `https://${forwarded}` : request.url);
}

export function notificationUrl() {
  return `${siteOrigin()}/api/midtrans/notification`;
}
