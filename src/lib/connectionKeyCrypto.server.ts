import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// APP_USER_CONNECTION_KEY_SECRET may be a base64 32-byte key or any long random string.
function key(): Buffer {
  const raw = process.env["APP_USER_CONNECTION_KEY_SECRET"];
  if (!raw) throw new Error("APP_USER_CONNECTION_KEY_SECRET is not set");
  const b64 = /^[A-Za-z0-9+/]+={0,2}$/.test(raw) ? Buffer.from(raw, "base64") : null;
  if (b64 && b64.length === 32 && raw.length === 44) return b64;
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptConnectionKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptConnectionKey(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
