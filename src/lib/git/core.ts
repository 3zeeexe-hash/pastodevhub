// Pure git object + packfile helpers (server and tests only).
import { createHash } from "node:crypto";
import { deflate } from "pako";
import * as zinflate from "pako/lib/zlib/inflate.js";
import ZStream from "pako/lib/zlib/zstream.js";

export type ObjType = "blob" | "tree" | "commit" | "tag";
export type GitObject = { type: ObjType; data: Uint8Array };
export type TreeEntry = { mode: string; name: string; sha: string };
export type Commit = { tree: string; parents: string[]; author: string; committer: string; message: string };

export const ZERO = "0000000000000000000000000000000000000000";
const enc = new TextEncoder();
const dec = new TextDecoder();

export function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export const utf8 = (s: string) => enc.encode(s);
export const fromUtf8 = (b: Uint8Array) => dec.decode(b);

export function hexToBytes(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function bytesToHex(b: Uint8Array) {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, "0");
  return s;
}

export function hashObject(type: ObjType, data: Uint8Array): string {
  const h = createHash("sha1");
  h.update(utf8(`${type} ${data.length}\0`));
  h.update(data);
  return h.digest("hex");
}

/** True when bytes look like a binary file (git's NUL heuristic) or are not valid UTF-8. */
export function isBinary(data: Uint8Array) {
  if (data.subarray(0, 8000).includes(0)) return true;
  try { new TextDecoder("utf-8", { fatal: true }).decode(data); return false; } catch { return true; }
}

// ---------- trees ----------
export function parseTree(data: Uint8Array): TreeEntry[] {
  const out: TreeEntry[] = [];
  let i = 0;
  while (i < data.length) {
    const sp = data.indexOf(0x20, i);
    const nul = data.indexOf(0, sp);
    const mode = fromUtf8(data.subarray(i, sp));
    const name = fromUtf8(data.subarray(sp + 1, nul));
    const sha = bytesToHex(data.subarray(nul + 1, nul + 21));
    out.push({ mode: mode === "40000" ? "40000" : mode, name, sha });
    i = nul + 21;
  }
  return out;
}

function compareBytes(a: Uint8Array, b: Uint8Array) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

export function encodeTree(entries: TreeEntry[]): Uint8Array {
  const keyed = entries.map((e) => ({ e, key: utf8(e.mode === "40000" ? `${e.name}/` : e.name) }));
  keyed.sort((x, y) => compareBytes(x.key, y.key));
  return concat(keyed.flatMap(({ e }) => [utf8(`${e.mode} ${e.name}\0`), hexToBytes(e.sha)]));
}

// ---------- commits ----------
export function parseCommit(data: Uint8Array): Commit {
  const text = fromUtf8(data);
  const split = text.indexOf("\n\n");
  const head = split === -1 ? text : text.slice(0, split);
  const message = split === -1 ? "" : text.slice(split + 2);
  const c: Commit = { tree: "", parents: [], author: "", committer: "", message };
  for (const line of head.split("\n")) {
    if (line.startsWith(" ")) continue; // continuation (gpgsig)
    const sp = line.indexOf(" ");
    const k = line.slice(0, sp);
    const v = line.slice(sp + 1);
    if (k === "tree") c.tree = v;
    else if (k === "parent") c.parents.push(v);
    else if (k === "author") c.author = v;
    else if (k === "committer") c.committer = v;
  }
  return c;
}

export function encodeCommit(c: Commit): Uint8Array {
  const lines = [`tree ${c.tree}`, ...c.parents.map((p) => `parent ${p}`), `author ${c.author}`, `committer ${c.committer}`];
  return utf8(`${lines.join("\n")}\n\n${c.message.endsWith("\n") ? c.message : `${c.message}\n`}`);
}

export function signature(name: string, email: string, date: Date) {
  const clean = (s: string) => s.replace(/[<>\n]/g, "").trim() || "pastodev";
  return `${clean(name)} <${clean(email)}> ${Math.floor(date.getTime() / 1000)} +0000`;
}

/** Name from an "author" line: `Name <email> 123 +0000`. */
export function signatureName(sig: string) {
  return sig.replace(/\s*<.*$/, "").trim();
}

/** First line of a commit message, trimmed. */
export function commitTitle(message: string) {
  return (message.split("\n").find((l) => l.trim()) ?? "Push dari terminal").trim().slice(0, 300);
}

// ---------- pkt-line ----------
export function pkt(line: string | Uint8Array): Uint8Array {
  const body = typeof line === "string" ? utf8(line) : line;
  return concat([utf8((body.length + 4).toString(16).padStart(4, "0")), body]);
}
export const FLUSH = utf8("0000");

/** Reads pkt-lines from `buf` until a flush (or until `stopAtFlush` flushes). Returns lines and the offset after them. */
export function readPktLines(buf: Uint8Array, start = 0, stopAtFlush = true): { lines: (string | null)[]; offset: number } {
  const lines: (string | null)[] = [];
  let i = start;
  while (i + 4 <= buf.length) {
    const len = parseInt(fromUtf8(buf.subarray(i, i + 4)), 16);
    if (Number.isNaN(len)) break;
    if (len === 0) {
      i += 4;
      lines.push(null);
      if (stopAtFlush) break;
      continue;
    }
    lines.push(fromUtf8(buf.subarray(i + 4, i + len)).replace(/\n$/, ""));
    i += len;
  }
  return { lines, offset: i };
}

// ---------- packfiles ----------
const TYPE_CODE: Record<ObjType, number> = { commit: 1, tree: 2, blob: 3, tag: 4 };
const CODE_TYPE: Record<number, ObjType> = { 1: "commit", 2: "tree", 3: "blob", 4: "tag" };

export function buildPack(objects: GitObject[]): Uint8Array {
  const header = new Uint8Array(12);
  header.set(utf8("PACK"));
  const view = new DataView(header.buffer);
  view.setUint32(4, 2);
  view.setUint32(8, objects.length);
  const parts: Uint8Array[] = [header];
  for (const o of objects) {
    let size = o.data.length;
    const bytes: number[] = [];
    let byte = (TYPE_CODE[o.type] << 4) | (size & 15);
    size = Math.floor(size / 16);
    while (size > 0) {
      bytes.push(byte | 0x80);
      byte = size & 0x7f;
      size = Math.floor(size / 128);
    }
    bytes.push(byte);
    parts.push(Uint8Array.from(bytes), deflate(o.data));
  }
  const body = concat(parts);
  const sha = createHash("sha1").update(body).digest();
  return concat([body, new Uint8Array(sha)]);
}

function inflateAt(buf: Uint8Array, offset: number, size: number): { data: Uint8Array; used: number } {
  const s = new ZStream();
  zinflate.inflateInit(s);
  s.input = buf;
  s.next_in = offset;
  s.avail_in = buf.length - offset;
  s.output = new Uint8Array(size);
  s.next_out = 0;
  s.avail_out = size;
  const status = zinflate.inflate(s, 4 /* Z_FINISH */);
  zinflate.inflateEnd(s);
  if (status !== 1 /* Z_STREAM_END */) throw new Error(`pack rusak (zlib ${status})`);
  return { data: s.output, used: s.next_in - offset };
}

function readVarint(d: Uint8Array, p: { i: number }) {
  let n = 0;
  let shift = 1;
  let c: number;
  do {
    c = d[p.i++]!;
    n += (c & 0x7f) * shift;
    shift *= 128;
  } while (c & 0x80);
  return n;
}

export function applyDelta(base: Uint8Array, delta: Uint8Array): Uint8Array {
  const p = { i: 0 };
  const srcSize = readVarint(delta, p);
  if (srcSize !== base.length) throw new Error("delta tidak cocok dengan basisnya");
  const out = new Uint8Array(readVarint(delta, p));
  let o = 0;
  while (p.i < delta.length) {
    const op = delta[p.i++]!;
    if (op & 0x80) {
      let off = 0;
      let len = 0;
      if (op & 1) off |= delta[p.i++]!;
      if (op & 2) off |= delta[p.i++]! << 8;
      if (op & 4) off |= delta[p.i++]! << 16;
      if (op & 8) off += delta[p.i++]! * 0x1000000;
      if (op & 16) len |= delta[p.i++]!;
      if (op & 32) len |= delta[p.i++]! << 8;
      if (op & 64) len |= delta[p.i++]! << 16;
      if (len === 0) len = 0x10000;
      out.set(base.subarray(off, off + len), o);
      o += len;
    } else if (op > 0) {
      out.set(delta.subarray(p.i, p.i + op), o);
      o += op;
      p.i += op;
    } else throw new Error("instruksi delta tidak valid");
  }
  if (o !== out.length) throw new Error("ukuran hasil delta salah");
  return out;
}

export type ParsedObject = GitObject & { sha: string };

/** Parses a packfile, resolving ofs/ref deltas (ref bases may come from `external`). */
export function parsePack(buf: Uint8Array, external: (sha: string) => GitObject | undefined = () => undefined): ParsedObject[] {
  if (fromUtf8(buf.subarray(0, 4)) !== "PACK") throw new Error("bukan packfile");
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const count = view.getUint32(8);
  type Raw = { offset: number; code: number; data: Uint8Array; baseOffset?: number; baseSha?: string };
  const raws: Raw[] = [];
  let i = 12;
  for (let n = 0; n < count; n++) {
    const offset = i;
    let c = buf[i++]!;
    const code = (c >> 4) & 7;
    let size = c & 15;
    let shift = 16;
    while (c & 0x80) {
      c = buf[i++]!;
      size += (c & 0x7f) * shift;
      shift *= 128;
    }
    const raw: Raw = { offset, code, data: new Uint8Array() };
    if (code === 6) {
      c = buf[i++]!;
      let ofs = c & 0x7f;
      while (c & 0x80) {
        c = buf[i++]!;
        ofs = (ofs + 1) * 128 + (c & 0x7f);
      }
      raw.baseOffset = offset - ofs;
    } else if (code === 7) {
      raw.baseSha = bytesToHex(buf.subarray(i, i + 20));
      i += 20;
    } else if (!CODE_TYPE[code]) throw new Error(`tipe objek pack tidak dikenal: ${code}`);
    const { data, used } = inflateAt(buf, i, size);
    raw.data = data;
    i += used;
    raws.push(raw);
  }
  const byOffset = new Map<number, ParsedObject>();
  const bySha = new Map<string, ParsedObject>();
  const pending = new Map<number, Raw>();
  for (const r of raws) {
    if (r.code >= 1 && r.code <= 4) {
      const type = CODE_TYPE[r.code]!;
      const o = { type, data: r.data, sha: hashObject(type, r.data) };
      byOffset.set(r.offset, o);
      bySha.set(o.sha, o);
    } else pending.set(r.offset, r);
  }
  // Resolve deltas until no progress (bases can be other deltas).
  let progress = true;
  while (pending.size && progress) {
    progress = false;
    for (const [off, r] of pending) {
      const base = r.baseOffset !== undefined ? byOffset.get(r.baseOffset) : (bySha.get(r.baseSha!) ?? (external(r.baseSha!) as ParsedObject | undefined));
      if (!base) continue;
      const data = applyDelta(base.data, r.data);
      const o = { type: base.type, data, sha: hashObject(base.type, data) };
      byOffset.set(off, o);
      bySha.set(o.sha, o);
      pending.delete(off);
      progress = true;
    }
  }
  if (pending.size) throw new Error("objek dasar delta tidak ditemukan");
  return raws.map((r) => byOffset.get(r.offset)!);
}

// ---------- token helpers ----------
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
