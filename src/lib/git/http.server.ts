// Server-only: git "smart HTTP" endpoint so repos can be cloned, pulled and pushed from the terminal:
//   git clone https://<site>/<user>/<repo>.git
// Pushing needs a personal access token (Pengaturan → Token git) as the password.
import { ungzip } from "pako";
import { concat, FLUSH, hashToken, parsePack, pkt, readPktLines, ZERO, type ParsedObject } from "@/lib/git/core";
import { applyPush, ensureSynced, getDb, packFor, type RepoInfo } from "@/lib/git/store.server";

export const GIT_PATH = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/(info\/refs|git-upload-pack|git-receive-pack)$/;
type Service = "git-upload-pack" | "git-receive-pack";
const AGENT = "agent=pastodev/1.0";
const bin = (b: Uint8Array) => b as unknown as BodyInit;

function text(status: number, body: string, extra: Record<string, string> = {}) {
  return new Response(`${body}\n`, { status, headers: { "content-type": "text/plain; charset=utf-8", ...extra } });
}
const unauthorized = () => text(401, "Butuh autentikasi. Pakai username Pastodev dan token git (Pengaturan → Token git) sebagai kata sandi.", { "WWW-Authenticate": 'Basic realm="Pastodev"' });

async function readBody(request: Request) {
  const raw = new Uint8Array(await request.arrayBuffer());
  return request.headers.get("content-encoding")?.includes("gzip") ? ungzip(raw) : raw;
}

async function authUser(request: Request, db: Awaited<ReturnType<typeof getDb>>): Promise<string | null | "bad"> {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("basic ")) return null;
  let decoded = "";
  try { decoded = atob(header.slice(6).trim()); } catch { return "bad"; }
  const i = decoded.indexOf(":");
  const user = i === -1 ? decoded : decoded.slice(0, i);
  const pass = i === -1 ? "" : decoded.slice(i + 1);
  const token = [pass, user].find((v) => v.startsWith("pdt_"));
  if (!token) return "bad";
  const { data } = await db.from("git_tokens").select("id,user_id").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data) return "bad";
  await db.from("git_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.user_id;
}

async function findRepo(db: Awaited<ReturnType<typeof getDb>>, owner: string, name: string): Promise<RepoInfo | null> {
  const { data: profile } = await db.from("profiles").select("id").ilike("username", owner.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (!profile) return null;
  const { data } = await db.from("repositories").select("id,owner_id,name,default_branch,is_private").eq("owner_id", profile.id).ilike("name", name.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  return data;
}

function advertise(service: Service, repo: RepoInfo, head: string | null) {
  const branch = `refs/heads/${repo.default_branch}`;
  const lines: Uint8Array[] = [pkt(`# service=${service}\n`), FLUSH];
  if (service === "git-upload-pack") {
    const caps = `symref=HEAD:${branch} no-progress ${AGENT}`;
    if (head) lines.push(pkt(`${head} HEAD\0${caps}\n`), pkt(`${head} ${branch}\n`));
    else lines.push(pkt(`${ZERO} capabilities^{}\0${caps}\n`));
  } else {
    const caps = `report-status no-thin ${AGENT}`;
    lines.push(pkt(head ? `${head} ${branch}\0${caps}\n` : `${ZERO} capabilities^{}\0${caps}\n`));
  }
  lines.push(FLUSH);
  return new Response(bin(concat(lines)), {
    headers: { "content-type": `application/x-${service}-advertisement`, "cache-control": "no-cache" },
  });
}

export async function handleGit(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const m = GIT_PATH.exec(url.pathname);
    if (!m) return text(404, "Tidak ditemukan.");
    const [, owner, name, action] = m as unknown as [string, string, string, string];
    const service: Service | null = action === "info/refs"
      ? (url.searchParams.get("service") as Service | null)
      : (action as Service);
    if (service !== "git-upload-pack" && service !== "git-receive-pack") return text(403, "Hanya protokol git smart HTTP yang didukung (git versi 1.6.6+).");
    if (action === "info/refs" ? request.method !== "GET" : request.method !== "POST") return text(405, "Metode tidak didukung.");

    const db = await getDb();
    const repo = await findRepo(db, owner, name);
    const userId = await authUser(request, db);
    if (userId === "bad") return unauthorized();
    const isOwner = !!repo && userId === repo.owner_id;
    if (!repo || (repo.is_private && !isOwner)) return userId ? text(404, "Repositori tidak ditemukan.") : unauthorized();
    if (service === "git-receive-pack" && !isOwner) return userId ? text(403, "Kamu tidak punya izin push ke repositori ini.") : unauthorized();

    const { head, store } = await ensureSynced(db, repo);
    if (action === "info/refs") return advertise(service, repo, head);

    const body = await readBody(request);
    if (service === "git-upload-pack") return uploadPack(body, store, head);
    return receivePack(db, repo, userId as string, body, head, store);
  } catch (e) {
    console.error("git endpoint failed", e);
    return text(500, `Gagal: ${e instanceof Error ? e.message : "kesalahan server"}`);
  }
}

function uploadPack(body: Uint8Array, store: Map<string, unknown>, head: string | null) {
  const { lines } = readPktLines(body, 0, false);
  const wants: string[] = [];
  const haves: string[] = [];
  let done = false;
  for (const l of lines) {
    if (!l) continue;
    if (l.startsWith("want ")) wants.push(l.slice(5, 45));
    else if (l.startsWith("have ")) haves.push(l.slice(5, 45));
    else if (l === "done") done = true;
  }
  const headers = { "content-type": "application/x-git-upload-pack-result", "cache-control": "no-cache" };
  for (const w of wants) if (!store.has(w)) return text(400, `Objek ${w} tidak ada (repo baru saja berubah? coba lagi).`);
  const common = haves.filter((h) => store.has(h));
  if (!done) {
    return new Response(bin(common.length ? pkt(`ACK ${common[0]}\n`) : pkt("NAK\n")), { headers });
  }
  if (!wants.length || !head) return new Response(bin(pkt("NAK\n")), { headers });
  const pack = packFor(store as never, wants, common);
  return new Response(bin(concat([common.length ? pkt(`ACK ${common[0]}\n`) : pkt("NAK\n"), pack])), { headers });
}

async function receivePack(db: Awaited<ReturnType<typeof getDb>>, repo: RepoInfo, userId: string, body: Uint8Array, head: string | null, store: Awaited<ReturnType<typeof ensureSynced>>["store"]) {
  const { lines, offset } = readPktLines(body);
  const commands = lines.filter((l): l is string => !!l).map((l) => {
    const [cmd] = l.split("\0") as [string];
    const [oldSha, newSha, ref] = cmd.split(" ") as [string, string, string];
    return { oldSha, newSha, ref };
  });
  const status: Uint8Array[] = [];
  const respond = (unpack: string) =>
    new Response(bin(concat([pkt(`unpack ${unpack}\n`), ...status, FLUSH])), { headers: { "content-type": "application/x-git-receive-pack-result", "cache-control": "no-cache" } });

  let incoming: ParsedObject[] = [];
  if (offset < body.length) {
    try {
      incoming = parsePack(body.subarray(offset), (sha) => store.get(sha));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "pack rusak";
      for (const c of commands) status.push(pkt(`ng ${c.ref} unpacker error\n`));
      return respond(msg);
    }
  }

  for (const c of commands) {
    const branch = c.ref.replace(/^refs\/heads\//, "");
    if (!c.ref.startsWith("refs/heads/")) { status.push(pkt(`ng ${c.ref} hanya branch yang didukung (tag belum didukung)\n`)); continue; }
    if (c.newSha === ZERO) { status.push(pkt(`ng ${c.ref} branch tidak bisa dihapus\n`)); continue; }
    if (head && branch !== repo.default_branch) { status.push(pkt(`ng ${c.ref} hanya branch ${repo.default_branch} yang didukung\n`)); continue; }
    if (c.oldSha !== (head ?? ZERO)) { status.push(pkt(`ng ${c.ref} fetch first\n`)); continue; }
    if (c.newSha === head) { status.push(pkt(`ok ${c.ref}\n`)); continue; }
    try {
      if (!head && branch !== repo.default_branch) repo = { ...repo, default_branch: branch };
      await applyPush(db, repo, userId, head, c.newSha, store, incoming);
      head = c.newSha;
      status.push(pkt(`ok ${c.ref}\n`));
    } catch (e) {
      console.error("push failed", e);
      status.push(pkt(`ng ${c.ref} ${e instanceof Error ? e.message.replace(/\n/g, " ") : "gagal"}\n`));
    }
  }
  return respond("ok");
}
