// Pure parsers for the Firebase settings the admin pastes/uploads (safe on server and client).

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
};

const KEYS = ["apiKey", "authDomain", "projectId", "appId", "storageBucket", "messagingSenderId", "measurementId"] as const;
const PROJECT_ID = /^[a-z0-9-]{4,40}$/;

/**
 * Accepts the web app config as JSON, as the `const firebaseConfig = {...}` snippet from the
 * Firebase console, or a google-services.json file. Throws a readable error when unusable.
 */
export function parseFirebaseConfig(input: string): FirebaseWebConfig {
  const text = input.trim();
  if (!text) throw new Error("Config Firebase masih kosong.");
  const out: Record<string, string> = {};
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not JSON: snippet */ }
  if (json && typeof json === "object") {
    const j = json as Record<string, any>;
    if (j["project_info"]) {
      // google-services.json (Android) — has project id and an API key.
      out["projectId"] = String(j["project_info"].project_id ?? "");
      out["apiKey"] = String(j["client"]?.[0]?.api_key?.[0]?.current_key ?? "");
      if (j["project_info"].storage_bucket) out["storageBucket"] = String(j["project_info"].storage_bucket);
      if (j["project_info"].project_number) out["messagingSenderId"] = String(j["project_info"].project_number);
    } else if (j["type"] === "service_account") {
      throw new Error("Ini file service account. Unggah di kolom “Service account JSON”, lalu tempel config web app di sini.");
    } else {
      for (const k of KEYS) if (typeof j[k] === "string") out[k] = j[k];
    }
  } else {
    for (const k of KEYS) {
      const m = new RegExp(`["']?${k}["']?\\s*:\\s*["'\`]([^"'\`]+)["'\`]`).exec(text);
      if (m?.[1]) out[k] = m[1];
    }
  }
  if (!out["apiKey"]) throw new Error("apiKey tidak ditemukan di config Firebase.");
  if (!out["projectId"] || !PROJECT_ID.test(out["projectId"])) throw new Error("projectId tidak ditemukan atau tidak valid.");
  if (!/^[A-Za-z0-9_-]{20,60}$/.test(out["apiKey"])) throw new Error("apiKey tidak valid.");
  out["authDomain"] ||= `${out["projectId"]}.firebaseapp.com`;
  if (!/^[a-z0-9.-]+$/i.test(out["authDomain"])) throw new Error("authDomain tidak valid.");
  const cfg: FirebaseWebConfig = { apiKey: out["apiKey"], authDomain: out["authDomain"], projectId: out["projectId"] };
  for (const k of ["appId", "storageBucket", "messagingSenderId", "measurementId"] as const) if (out[k]) cfg[k] = out[k];
  return cfg;
}

export type ServiceAccountInfo = { projectId: string; clientEmail: string };

/** Validates a Firebase/Google service-account key file. */
export function parseServiceAccount(input: string): ServiceAccountInfo {
  let j: Record<string, unknown>;
  try { j = JSON.parse(input) as Record<string, unknown>; } catch { throw new Error("File service account bukan JSON yang valid."); }
  if (j["type"] !== "service_account") throw new Error("File ini bukan service account (type harus \"service_account\").");
  const projectId = String(j["project_id"] ?? "");
  const clientEmail = String(j["client_email"] ?? "");
  const key = String(j["private_key"] ?? "");
  if (!PROJECT_ID.test(projectId)) throw new Error("project_id di service account tidak valid.");
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(clientEmail)) throw new Error("client_email di service account tidak valid.");
  if (!key.includes("PRIVATE KEY")) throw new Error("private_key tidak ada di service account.");
  return { projectId, clientEmail };
}
