// Server-only: keeps a real git history (objects + refs) in the database, next to the
// web view of the repo (repo_files + commits). Web commits are folded into git lazily;
// pushes from the terminal are written back to repo_files and commits.
import {
  buildPack, commitTitle, encodeCommit, encodeTree, fromUtf8, hashObject, isBinary, parseCommit, parseTree,
  signature, utf8, type GitObject, type ObjType, type ParsedObject,
} from "@/lib/git/core";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
export type RepoInfo = { id: string; owner_id: string; name: string; default_branch: string; is_private: boolean };
export type ObjectStore = Map<string, GitObject>;
type FlatEntry = { mode: string; sha: string };

export async function getDb(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const toB64 = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("base64");
const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

export async function loadObjects(db: Db, repoId: string): Promise<ObjectStore> {
  const out: ObjectStore = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("git_objects").select("sha,type,data").eq("repo_id", repoId).order("sha").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) out.set(r.sha, { type: r.type as ObjType, data: fromB64(r.data) });
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function saveObjects(db: Db, repoId: string, objects: { sha: string; type: ObjType; data: Uint8Array }[]) {
  let batch: { repo_id: string; sha: string; type: string; data: string }[] = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const { error } = await db.from("git_objects").upsert(batch, { onConflict: "repo_id,sha", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    batch = [];
    bytes = 0;
  };
  for (const o of objects) {
    const data = toB64(o.data);
    batch.push({ repo_id: repoId, sha: o.sha, type: o.type, data });
    bytes += data.length;
    if (batch.length >= 300 || bytes > 3_000_000) await flush();
  }
  await flush();
}

export async function getRef(db: Db, repoId: string, branch: string) {
  const { data } = await db.from("git_refs").select("sha,synced_commit_id").eq("repo_id", repoId).eq("name", `refs/heads/${branch}`).maybeSingle();
  return data;
}

async function loadFiles(db: Db, repoId: string) {
  const out = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("repo_files").select("path,content").eq("repo_id", repoId).order("path").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const f of data ?? []) out.set(f.path, f.content);
    if (!data || data.length < 1000) break;
  }
  return out;
}

function need(store: ObjectStore, sha: string, type: ObjType) {
  const o = store.get(sha);
  if (!o) throw new Error(`objek ${sha.slice(0, 7)} tidak ditemukan`);
  if (o.type !== type) throw new Error(`objek ${sha.slice(0, 7)} bukan ${type}`);
  return o;
}

/** path -> {mode, sha} for every non-tree entry under a tree. */
export function flattenTree(store: ObjectStore, treeSha: string, prefix = "", out = new Map<string, FlatEntry>()) {
  for (const e of parseTree(need(store, treeSha, "tree").data)) {
    const path = prefix + e.name;
    if (e.mode === "40000") flattenTree(store, e.sha, `${path}/`, out);
    else out.set(path, { mode: e.mode, sha: e.sha });
  }
  return out;
}

/** Builds tree objects from a flat path map; returns the root tree sha. */
export function buildTrees(flat: Map<string, FlatEntry>, add: (type: ObjType, data: Uint8Array) => string): string {
  type Dir = { files: Map<string, FlatEntry>; dirs: Map<string, Dir> };
  const root: Dir = { files: new Map(), dirs: new Map() };
  for (const [path, entry] of flat) {
    const parts = path.split("/");
    let d = root;
    for (const p of parts.slice(0, -1)) {
      let next = d.dirs.get(p);
      if (!next) { next = { files: new Map(), dirs: new Map() }; d.dirs.set(p, next); }
      d = next;
    }
    d.files.set(parts[parts.length - 1]!, entry);
  }
  const write = (d: Dir): string => {
    const entries = [...d.files].map(([name, e]) => ({ name, mode: e.mode, sha: e.sha }));
    for (const [name, sub] of d.dirs) entries.push({ name, mode: "40000", sha: write(sub) });
    return add("tree", encodeTree(entries));
  };
  return write(root);
}

/**
 * Makes sure the branch ref includes the latest web commit. Returns the branch head
 * (or null for an empty repo) plus the object store.
 */
export async function ensureSynced(db: Db, repo: RepoInfo): Promise<{ head: string | null; store: ObjectStore }> {
  const [ref, latestRes] = await Promise.all([
    getRef(db, repo.id, repo.default_branch),
    db.from("commits").select("id,message,created_at,author_id").eq("repo_id", repo.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const latest = latestRes.data;
  const store = await loadObjects(db, repo.id);
  if (!latest) return { head: ref?.sha ?? null, store };
  if (ref && ref.synced_commit_id === latest.id) return { head: ref.sha, store };

  const files = await loadFiles(db, repo.id);
  if (!ref && files.size === 0) return { head: null, store };
  const created: { sha: string; type: ObjType; data: Uint8Array }[] = [];
  const add = (type: ObjType, data: Uint8Array) => {
    const sha = hashObject(type, data);
    if (!store.has(sha)) { store.set(sha, { type, data }); created.push({ sha, type, data }); }
    return sha;
  };
  const old = ref ? flattenTree(store, parseCommit(need(store, ref.sha, "commit").data).tree) : new Map<string, FlatEntry>();
  const flat = new Map<string, FlatEntry>();
  for (const [path, content] of files) {
    const prev = old.get(path);
    flat.set(path, { mode: prev?.mode === "100755" ? "100755" : "100644", sha: add("blob", utf8(content)) });
  }
  // Keep files the web view cannot show (binary files, symlinks, submodules).
  for (const [path, e] of old) {
    if (flat.has(path)) continue;
    const blob = store.get(e.sha);
    if (e.mode === "120000" || e.mode === "160000" || (blob && isBinary(blob.data))) flat.set(path, e);
  }
  const tree = buildTrees(flat, add);
  let head = ref?.sha ?? null;
  const oldTree = ref ? parseCommit(need(store, ref.sha, "commit").data).tree : null;
  if (tree !== oldTree) {
    const { data: author } = await db.from("profiles").select("username,display_name").eq("id", latest.author_id).maybeSingle();
    const who = author?.username ?? "pastodev";
    const sig = signature(author?.display_name || who, `${who}@users.noreply.pastodev.com`, new Date(latest.created_at));
    head = add("commit", encodeCommit({ tree, parents: ref ? [ref.sha] : [], author: sig, committer: sig, message: latest.message }));
  }
  await saveObjects(db, repo.id, created);
  if (head) {
    const { error } = await db.from("git_refs").upsert({ repo_id: repo.id, name: `refs/heads/${repo.default_branch}`, sha: head, synced_commit_id: latest.id, updated_at: new Date().toISOString() }, { onConflict: "repo_id,name" });
    if (error) throw new Error(error.message);
  }
  return { head, store };
}

/** Every object reachable from the given commits (full history). */
export function reachable(store: ObjectStore, commits: string[]): Set<string> {
  const seen = new Set<string>();
  const walkTree = (sha: string) => {
    if (seen.has(sha)) return;
    seen.add(sha);
    for (const e of parseTree(need(store, sha, "tree").data)) {
      if (e.mode === "40000") walkTree(e.sha);
      else if (e.mode !== "160000") seen.add(e.sha);
    }
  };
  const stack = [...commits];
  while (stack.length) {
    const sha = stack.pop()!;
    if (seen.has(sha) || !store.has(sha)) continue;
    seen.add(sha);
    const c = parseCommit(need(store, sha, "commit").data);
    walkTree(c.tree);
    stack.push(...c.parents);
  }
  return seen;
}

export function packFor(store: ObjectStore, wants: string[], haves: string[]) {
  const exclude = haves.length ? reachable(store, haves) : new Set<string>();
  const objects: GitObject[] = [];
  for (const sha of reachable(store, wants)) if (!exclude.has(sha)) objects.push(store.get(sha)!);
  return buildPack(objects);
}

const MAX_COMMIT_ROWS = 300;

/**
 * Applies a pushed branch head to the web view: updates repo_files, records the
 * new commits in history, and moves the ref.
 */
export async function applyPush(db: Db, repo: RepoInfo, userId: string, oldHead: string | null, newHead: string, store: ObjectStore, incoming: ParsedObject[]) {
  const known = new Set(store.keys());
  for (const o of incoming) store.set(o.sha, o);
  const newCommit = parseCommit(need(store, newHead, "commit").data);
  const newFlat = flattenTree(store, newCommit.tree);
  reachable(store, [newHead]); // throws if anything is missing

  await saveObjects(db, repo.id, incoming.filter((o) => o.sha));

  // New commits on the first-parent chain, newest first.
  const chain: { sha: string; c: ReturnType<typeof parseCommit> }[] = [];
  for (let sha: string | undefined = newHead; sha && sha !== oldHead && !known.has(sha) && chain.length < MAX_COMMIT_ROWS; ) {
    const c = parseCommit(need(store, sha, "commit").data);
    chain.push({ sha, c });
    sha = c.parents[0];
  }
  if (!chain.length) chain.push({ sha: newHead, c: { ...newCommit, message: `Reset branch ke ${newHead.slice(0, 7)}` } });

  // Working tree diff against what the web currently shows.
  const current = await loadFiles(db, repo.id);
  const upserts: { path: string; content: string; before?: string }[] = [];
  for (const [path, e] of newFlat) {
    if (e.mode !== "100644" && e.mode !== "100755") continue;
    const blob = need(store, e.sha, "blob").data;
    if (isBinary(blob)) continue;
    const content = fromUtf8(blob);
    const before = current.get(path);
    if (before !== content) upserts.push(before === undefined ? { path, content } : { path, content, before });
  }
  const deletes = [...current.keys()].filter((p) => {
    const e = newFlat.get(p);
    return !e || (e.mode !== "100644" && e.mode !== "100755") || isBinary(need(store, e.sha, "blob").data);
  });

  const now = new Date().toISOString();
  for (let i = 0; i < upserts.length; i += 50) {
    const rows = upserts.slice(i, i + 50).map((u) => ({ repo_id: repo.id, path: u.path, content: u.content, updated_at: now }));
    const { error } = await db.from("repo_files").upsert(rows, { onConflict: "repo_id,path" });
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < deletes.length; i += 100) {
    const { error } = await db.from("repo_files").delete().eq("repo_id", repo.id).in("path", deletes.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }

  // History rows: the head commit carries the full diff, older ones list changed paths.
  const headChanges: { path: string; type: string; before?: string | undefined; after?: string | undefined }[] = [
    ...upserts.map((u) => ({ path: u.path, type: u.before === undefined ? "add" : "modify", before: u.before, after: u.content })),
    ...deletes.map((p) => ({ path: p, type: "delete", before: current.get(p) })),
  ];
  const size = headChanges.reduce((n, c) => n + (c.before?.length ?? 0) + (c.after?.length ?? 0), 0);
  const headStored = headChanges.length <= 200 && size < 1_500_000 ? headChanges : headChanges.map((c) => ({ path: c.path, type: c.type }));
  const nowMs = Date.parse(now);
  const rows = chain.map(({ sha, c }, idx) => {
    let changes: unknown = [];
    if (idx === 0) changes = headStored;
    else {
      const parent = c.parents[0] ? flattenTree(store, parseCommit(need(store, c.parents[0], "commit").data).tree) : new Map<string, FlatEntry>();
      const mine = flattenTree(store, c.tree);
      const list: { path: string; type: string }[] = [];
      for (const [p, e] of mine) { const pe = parent.get(p); if (!pe) list.push({ path: p, type: "add" }); else if (pe.sha !== e.sha) list.push({ path: p, type: "modify" }); }
      for (const p of parent.keys()) if (!mine.has(p)) list.push({ path: p, type: "delete" });
      changes = list.slice(0, 500);
    }
    const authored = Number(c.author.match(/ (\d+) [+-]\d{4}$/)?.[1] ?? 0) * 1000;
    const createdAt = idx === 0 ? now : new Date(Math.min(authored || nowMs - idx, nowMs - idx)).toISOString();
    return { repo_id: repo.id, author_id: userId, message: c.message.trim().slice(0, 5000) || commitTitle(c.message), changes: changes as never, created_at: createdAt, _sha: sha };
  });
  let headRowId: string | null = null;
  // Insert oldest first so ids/timestamps line up with history order.
  for (let i = rows.length; i > 0; i -= 100) {
    const slice = rows.slice(Math.max(0, i - 100), i).reverse().map(({ _sha, ...r }) => r);
    const { data, error } = await db.from("commits").insert(slice).select("id,created_at");
    if (error) throw new Error(error.message);
    const newest = (data ?? []).find((r) => r.created_at === now || Date.parse(r.created_at) === nowMs);
    if (newest) headRowId = newest.id;
  }

  const { error: refErr } = await db.from("git_refs").upsert({ repo_id: repo.id, name: `refs/heads/${repo.default_branch}`, sha: newHead, synced_commit_id: headRowId, updated_at: now }, { onConflict: "repo_id,name" });
  if (refErr) throw new Error(refErr.message);
  await db.from("repositories").update({ updated_at: now, default_branch: repo.default_branch }).eq("id", repo.id);
  return { files: upserts.length, deleted: deletes.length, commits: chain.length };
}
