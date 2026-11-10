// Server-only storage for each user's GitHub access token.
// The token is always encrypted with APP_USER_CONNECTION_KEY_SECRET before it is saved;
// database rules let a signed-in user touch only their own row.
import { encryptConnectionKey, decryptConnectionKey } from "@/lib/connectionKeyCrypto.server";

type Db = { from: (table: string) => any };

function asError(e: unknown, fallback: string): Error {
  if (e instanceof Error) return e;
  if (e && typeof e === "object" && "message" in e) return new Error(String((e as { message: unknown }).message));
  return new Error(fallback);
}

function encrypt(value: string): string {
  if (!process.env["APP_USER_CONNECTION_KEY_SECRET"]) {
    throw new Error("APP_USER_CONNECTION_KEY_SECRET belum diatur di environment server.");
  }
  return encryptConnectionKey(value);
}

function decrypt(stored: string): string | null {
  try {
    return decryptConnectionKey(stored);
  } catch {
    // Old rows saved without encryption, or a changed key: treat as "reconnect needed".
    return null;
  }
}

export async function saveConnectionKeyForUser(
  db: Db,
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
  meta: { login?: string | null; avatarUrl?: string | null } = {},
) {
  const { error } = await db.from("app_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: encrypt(connectionAPIKey),
      provider_login: meta.login ?? null,
      provider_avatar_url: meta.avatarUrl ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw asError(error, "Gagal menyimpan koneksi GitHub.");
}

export async function getConnectionForUser(db: Db, userId: string, connectorId: string) {
  const { data, error } = await db
    .from("app_user_connections")
    .select("connection_key_ciphertext, provider_login, provider_avatar_url")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw asError(error, "Gagal membaca koneksi GitHub.");
  if (!data) return null;
  return {
    key: decrypt(data.connection_key_ciphertext as string),
    login: data.provider_login as string | null,
    avatarUrl: data.provider_avatar_url as string | null,
  };
}

export async function deleteConnectionForUser(db: Db, userId: string, connectorId: string) {
  const { error } = await db
    .from("app_user_connections")
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
  if (error) throw asError(error, "Gagal memutus koneksi GitHub.");
}
