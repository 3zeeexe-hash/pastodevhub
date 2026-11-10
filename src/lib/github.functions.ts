// All GitHub calls. Runs on the server only; the browser never sees the GitHub token.
// Uses the platform's own GitHub OAuth app, set in the admin panel (env GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET as fallback).
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  deleteConnectionForUser,
  getConnectionForUser,
  saveConnectionKeyForUser,
} from "@/lib/appUserConnections.server";

const CONNECTOR = "github";
const GITHUB_SCOPES = ["read:user", "repo"];
const MAX_FILE_BYTES = 400_000;
const MAX_FILES = 1500;
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|bmp|tiff?|avif|mp[34]|mov|webm|wav|ogg|flac|zip|gz|tgz|rar|7z|tar|jar|exe|dll|so|dylib|bin|pdf|woff2?|ttf|otf|eot|psd|sketch|fig|lockb)$/i;

const fullNameSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/, "Nama repo GitHub tidak valid");

type Db = Parameters<typeof getConnectionForUser>[0];

/** Stops every GitHub call while the admin has switched the GitHub feature off. */
async function requireGithubFeature(db: Db) {
  const { data } = await (db as any).rpc("feature_allowed", { _key: "github" });
  if (data === false) throw new Error("Fitur GitHub sedang dinonaktifkan admin.");
}

/** Loads the user's GitHub token once per request. */
async function tokenFor(db: Db, userId: string) {
  await requireGithubFeature(db);
  const conn = await getConnectionForUser(db, userId, CONNECTOR);
  if (!conn) throw new Error("GITHUB_NOT_CONNECTED");
  if (!conn.key) throw new Error("GITHUB_RECONNECT");
  return { token: conn.key, login: conn.login };
}

async function gh(token: string, path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("User-Agent", "Pastodev-App");
  if (init?.body) headers.set("Content-Type", "application/json");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`https://api.github.com${cleanPath}`, { ...init, headers });
  if (res.status === 401) throw new Error("GITHUB_RECONNECT");
  return res;
}

async function ghJson<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await gh(token, path, init);
  if (!res.ok) {
    const text = await res.text();
    console.error(`GitHub request failed [${res.status}] ${path}: ${text.slice(0, 500)}`);
    let msg = text;
    try { msg = (JSON.parse(text) as { message?: string }).message ?? text; } catch { /* keep text */ }
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") msg = "Batas permintaan GitHub habis, coba lagi nanti.";
    if (res.status === 404) msg = "Repo tidak ditemukan atau akun GitHub kamu tidak punya akses.";
    throw new Error(`GitHub ${res.status}: ${msg.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

function returnUrlFor(path: string) {
  const request = getRequest();
  if (!request) throw new Error("OAuth harus dimulai dari halaman aplikasi.");
  const url = new URL(request.url);
  const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  return new URL(path, sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
}

export const githubStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const conn = await getConnectionForUser(context.supabase, context.userId, CONNECTOR);
    if (!conn) return { connected: false as const, login: null, avatarUrl: null, reconnect: false };
    return { connected: true as const, login: conn.login, avatarUrl: conn.avatarUrl, reconnect: !conn.key };
  });

export const startGithubConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireGithubFeature(context.supabase);
    const { getGithubOAuthConfig } = await import("@/lib/platform-secrets.server");
    const cfg = await getGithubOAuthConfig();
    if (!cfg) throw new Error("Koneksi GitHub belum diatur admin. Atur Client ID & Secret di panel Admin.");
    const clientId = cfg.clientId;
    const redirectUri = returnUrlFor("/api/oauth/github/return");
    const state = crypto.randomUUID();
    const authorizationUrl =
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(GITHUB_SCOPES.join(" "))}&state=${state}`;
    return { authorizationUrl, state };
  });

export const completeGithubConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => z.object({ code: z.string().min(1).max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { getGithubOAuthConfig } = await import("@/lib/platform-secrets.server");
    const cfg = await getGithubOAuthConfig();
    if (!cfg) throw new Error("Koneksi GitHub belum diatur admin. Atur Client ID & Secret di panel Admin.");
    const { clientId, clientSecret } = cfg;

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: data.code }),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Gagal menukar kode GitHub (${tokenRes.status}): ${errText.slice(0, 200)}`);
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };
    if (!tokenData.access_token) throw new Error(tokenData.error_description || tokenData.error || "GitHub tidak mengembalikan token.");

    let login: string | null = null;
    let avatarUrl: string | null = null;
    const userRes = await gh(tokenData.access_token, "/user");
    if (userRes.ok) {
      const me = (await userRes.json()) as { login: string; avatar_url: string };
      login = me.login;
      avatarUrl = me.avatar_url;
    }
    await saveConnectionKeyForUser(context.supabase, context.userId, CONNECTOR, tokenData.access_token, { login, avatarUrl });
    return { ok: true, login };
  });

export const disconnectGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await deleteConnectionForUser(context.supabase, context.userId, CONNECTOR);
    return { ok: true };
  });

type GhRepo = {
  full_name: string; name: string; private: boolean; description: string | null; language: string | null;
  updated_at: string; default_branch: string; stargazers_count: number; fork: boolean; html_url: string; topics?: string[]; homepage?: string | null;
};

export const listGithubRepos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { page: number }) => z.object({ page: z.number().int().min(1).max(50) }).parse(input))
  .handler(async ({ data, context }) => {
    const { token } = await tokenFor(context.supabase, context.userId);
    const repos = await ghJson<GhRepo[]>(token, `/user/repos?per_page=50&page=${data.page}&sort=updated&affiliation=owner,collaborator,organization_member`);
    return repos.map((r) => ({
      fullName: r.full_name, name: r.name, private: r.private, description: r.description ?? "", language: r.language ?? "",
      updatedAt: r.updated_at, stars: r.stargazers_count, fork: r.fork, url: r.html_url,
    }));
  });

export const getGithubTree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fullName: string }) => z.object({ fullName: fullNameSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { token } = await tokenFor(context.supabase, context.userId);
    const info = await ghJson<GhRepo>(token, `/repos/${data.fullName}`);
    const res = await gh(token, `/repos/${data.fullName}/git/trees/${encodeURIComponent(info.default_branch)}?recursive=1`);
    let entries: { path: string; type: string; sha: string; size?: number }[] = [];
    let truncated = false;
    if (res.status === 409 || res.status === 404) {
      entries = []; // empty repo
    } else if (!res.ok) {
      throw new Error(`GitHub ${res.status}: gagal membaca isi repo`);
    } else {
      const tree = (await res.json()) as { tree: typeof entries; truncated: boolean };
      entries = tree.tree;
      truncated = tree.truncated;
    }
    const blobs = entries.filter((e) => e.type === "blob");
    const files = blobs.filter((e) => (e.size ?? 0) <= MAX_FILE_BYTES && !SKIP_EXT.test(e.path)).slice(0, MAX_FILES);
    return {
      name: info.name,
      description: info.description ?? "",
      language: info.language ?? "",
      private: info.private,
      topics: info.topics ?? [],
      homepage: info.homepage ?? "",
      defaultBranch: info.default_branch,
      files: files.map((f) => ({ path: f.path, sha: f.sha })),
      skipped: blobs.length - files.length,
      truncated,
    };
  });

export const fetchGithubBlobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fullName: string; shas: string[] }) =>
    z.object({ fullName: fullNameSchema, shas: z.array(z.string().regex(/^[0-9a-f]{40}$/)).min(1).max(25) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { token } = await tokenFor(context.supabase, context.userId);
    return Promise.all(
      data.shas.map(async (sha) => {
        try {
          const blob = await ghJson<{ content: string; encoding: string }>(token, `/repos/${data.fullName}/git/blobs/${sha}`);
          if (blob.encoding !== "base64") return { sha, content: blob.content as string | null };
          const bin = atob(blob.content.replace(/\n/g, ""));
          const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
          if (bytes.subarray(0, 8000).includes(0)) return { sha, content: null };
          return { sha, content: new TextDecoder().decode(bytes) as string | null };
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("GITHUB_")) throw e;
          return { sha, content: null };
        }
      }),
    );
  });

export const exportToGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { repoId: string; githubName?: string | undefined; isPrivate?: boolean | undefined; message?: string | undefined }) =>
    z.object({
      repoId: z.string().uuid(),
      githubName: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/).optional(),
      isPrivate: z.boolean().optional(),
      message: z.string().trim().min(1).max(300).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: repo, error } = await sb.from("repositories").select("*").eq("id", data.repoId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!repo || repo.owner_id !== context.userId) throw new Error("Hanya pemilik repositori yang bisa mengekspor.");

    const { token, login } = await tokenFor(sb, context.userId);
    if (!login) throw new Error("GITHUB_RECONNECT");
    const targetName = (data.githubName || repo.name).trim();
    const fullName = `${login}/${targetName}`;

    let ghRepo: GhRepo | null = null;
    const existing = await gh(token, `/repos/${fullName}`);
    if (existing.ok) ghRepo = (await existing.json()) as GhRepo;
    else if (existing.status !== 404) throw new Error(`GitHub ${existing.status}: gagal membaca repo tujuan`);

    const created = !ghRepo;
    if (!ghRepo) {
      ghRepo = await ghJson<GhRepo>(token, "/user/repos", {
        method: "POST",
        body: JSON.stringify({ name: targetName, description: repo.description ?? "", private: data.isPrivate ?? repo.is_private, auto_init: true }),
      });
      await new Promise((r) => setTimeout(r, 1200));
    }

    const { data: files, error: filesErr } = await sb.from("repo_files").select("path, content").eq("repo_id", repo.id);
    if (filesErr) throw new Error(filesErr.message);
    // Text files go inline in one tree request, so a push needs only a handful of GitHub calls.
    const tree = (files ?? []).map((f) => ({ path: f.path, mode: "100644" as const, type: "blob" as const, content: f.content }));
    if (tree.length === 0) throw new Error("Repositori masih kosong.");

    const ref = await ghJson<{ object: { sha: string } }>(token, `/repos/${fullName}/git/ref/heads/${encodeURIComponent(ghRepo.default_branch)}`);
    const parentSha = ref.object.sha;
    const parent = await ghJson<{ tree: { sha: string } }>(token, `/repos/${fullName}/git/commits/${parentSha}`);
    const newTree = await ghJson<{ sha: string }>(token, `/repos/${fullName}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
    });
    const commit = await ghJson<{ sha: string }>(token, `/repos/${fullName}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: data.message || `Export dari Pastodev: ${repo.name}`, tree: newTree.sha, parents: [parentSha] }),
    });
    await ghJson(token, `/repos/${fullName}/git/refs/heads/${encodeURIComponent(ghRepo.default_branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    if (!repo.github_full_name) await sb.from("repositories").update({ github_full_name: fullName }).eq("id", repo.id);
    return { fullName, url: ghRepo.html_url, files: tree.length, created };
  });
