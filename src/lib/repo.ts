// Pure helpers for the repository model (no network, safe on server and client).

export type RepoFile = { id: string; repo_id: string; path: string; content: string; updated_at: string };
export type Change = { path: string; type: "add" | "modify" | "delete"; before?: string | undefined; after?: string | undefined };

const LANGS: Record<string, { name: string; color: string; hljs?: string }> = {
  ts: { name: "TypeScript", color: "#3178c6", hljs: "typescript" },
  tsx: { name: "TypeScript", color: "#3178c6", hljs: "typescript" },
  js: { name: "JavaScript", color: "#f1e05a", hljs: "javascript" },
  jsx: { name: "JavaScript", color: "#f1e05a", hljs: "javascript" },
  mjs: { name: "JavaScript", color: "#f1e05a", hljs: "javascript" },
  cjs: { name: "JavaScript", color: "#f1e05a", hljs: "javascript" },
  py: { name: "Python", color: "#3572A5", hljs: "python" },
  go: { name: "Go", color: "#00ADD8", hljs: "go" },
  rs: { name: "Rust", color: "#dea584", hljs: "rust" },
  java: { name: "Java", color: "#b07219", hljs: "java" },
  kt: { name: "Kotlin", color: "#A97BFF", hljs: "kotlin" },
  swift: { name: "Swift", color: "#F05138", hljs: "swift" },
  php: { name: "PHP", color: "#4F5D95", hljs: "php" },
  rb: { name: "Ruby", color: "#701516", hljs: "ruby" },
  c: { name: "C", color: "#555555", hljs: "c" },
  h: { name: "C", color: "#555555", hljs: "c" },
  cpp: { name: "C++", color: "#f34b7d", hljs: "cpp" },
  cc: { name: "C++", color: "#f34b7d", hljs: "cpp" },
  hpp: { name: "C++", color: "#f34b7d", hljs: "cpp" },
  cs: { name: "C#", color: "#178600", hljs: "csharp" },
  dart: { name: "Dart", color: "#00B4AB" },
  html: { name: "HTML", color: "#e34c26", hljs: "xml" },
  vue: { name: "Vue", color: "#41b883", hljs: "xml" },
  svelte: { name: "Svelte", color: "#ff3e00", hljs: "xml" },
  css: { name: "CSS", color: "#563d7c", hljs: "css" },
  scss: { name: "SCSS", color: "#c6538c", hljs: "scss" },
  sql: { name: "SQL", color: "#e38c00", hljs: "sql" },
  sh: { name: "Shell", color: "#89e051", hljs: "bash" },
  bash: { name: "Shell", color: "#89e051", hljs: "bash" },
  lua: { name: "Lua", color: "#000080", hljs: "lua" },
  md: { name: "Markdown", color: "#083fa1", hljs: "markdown" },
  json: { name: "JSON", color: "#292929", hljs: "json" },
  yml: { name: "YAML", color: "#cb171e", hljs: "yaml" },
  yaml: { name: "YAML", color: "#cb171e", hljs: "yaml" },
  toml: { name: "TOML", color: "#9c4221", hljs: "ini" },
  xml: { name: "XML", color: "#0060ac", hljs: "xml" },
};
const NON_CODE = new Set(["Markdown", "JSON", "YAML", "TOML", "XML"]);

export const ext = (path: string) => {
  const base = path.split("/").pop() ?? "";
  if (base === "Dockerfile") return "dockerfile";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
};
export const fileName = (path: string) => path.split("/").pop() ?? path;
export const languageOf = (path: string) => LANGS[ext(path)] ?? null;
export const hljsLanguage = (path: string) => (ext(path) === "dockerfile" ? "dockerfile" : LANGS[ext(path)]?.hljs);
export const languageColor = (name: string) =>
  Object.values(LANGS).find((l) => l.name.toLowerCase() === name.toLowerCase())?.color ?? "#8b949e";

/** Language share by bytes, like GitHub's language bar. */
export function languageStats(files: { path: string; content: string }[]) {
  const totals = new Map<string, number>();
  for (const f of files) {
    const l = languageOf(f.path);
    if (!l || NON_CODE.has(l.name)) continue;
    totals.set(l.name, (totals.get(l.name) ?? 0) + f.content.length);
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([name, bytes]) => ({ name, color: languageColor(name), pct: sum ? (bytes / sum) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);
}

export type DirEntry = { kind: "dir"; name: string; path: string } | { kind: "file"; name: string; path: string; file: RepoFile };

/** Immediate children of `dir` ("" = root), folders first, like GitHub's file list. */
export function listDir(files: RepoFile[], dir: string): DirEntry[] {
  const prefix = dir ? `${dir}/` : "";
  const dirs = new Set<string>();
  const out: DirEntry[] = [];
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) out.push({ kind: "file", name: rest, path: f.path, file: f });
    else dirs.add(rest.slice(0, slash));
  }
  const dirEntries: DirEntry[] = [...dirs].sort((a, b) => a.localeCompare(b)).map((name) => ({ kind: "dir", name, path: prefix + name }));
  out.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirEntries, ...out];
}

export function findReadme(files: RepoFile[], dir = "") {
  return listDir(files, dir).find((e) => e.kind === "file" && /^readme(\.md|\.markdown|\.txt)?$/i.test(e.name)) as
    | Extract<DirEntry, { kind: "file" }>
    | undefined;
}

export const REPO_NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

/** Normalises a user-typed file path; returns null when it is not a valid repo path. */
export function cleanPath(input: string): string | null {
  const p = input.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
  if (!p || p.length > 400) return null;
  if (p.split("/").some((s) => s === "." || s === ".." || s === "")) return null;
  return p;
}

export function looksBinary(s: string) {
  return s.includes("\u0000");
}

export type DiffLine = { type: "same" | "add" | "del"; text: string; a?: number; b?: number };

/** Line diff via LCS; falls back to full replace for very large inputs. */
export function diffLines(before: string, after: string): DiffLine[] {
  const split = (s: string) => (s === "" ? [] : (s.endsWith("\n") ? s.slice(0, -1) : s).split("\n"));
  const a = split(before);
  const b = split(after);
  const n = a.length, m = b.length;
  if (n * m > 4_000_000) {
    return [...a.map((t, i) => ({ type: "del" as const, text: t, a: i + 1 })), ...b.map((t, i) => ({ type: "add" as const, text: t, b: i + 1 }))];
  }
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i]!, next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j--) row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "same", text: a[i]!, a: i + 1, b: j + 1 }); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { out.push({ type: "del", text: a[i]!, a: i + 1 }); i++; }
    else { out.push({ type: "add", text: b[j]!, b: j + 1 }); j++; }
  }
  while (i < n) { out.push({ type: "del", text: a[i]!, a: i + 1 }); i++; }
  while (j < m) { out.push({ type: "add", text: b[j]!, b: j + 1 }); j++; }
  return out;
}

export function diffStats(changes: Change[]) {
  let add = 0, del = 0;
  for (const c of changes) {
    if (c.before === undefined && c.after === undefined) continue;
    for (const l of diffLines(c.before ?? "", c.after ?? "")) {
      if (l.type === "add") add++;
      else if (l.type === "del") del++;
    }
  }
  return { add, del };
}

/** What would change in `base` if it took `head`'s files (used by pull requests). */
export function computeChanges(base: { path: string; content: string }[], head: { path: string; content: string }[]): Change[] {
  const bm = new Map(base.map((f) => [f.path, f.content]));
  const hm = new Map(head.map((f) => [f.path, f.content]));
  const changes: Change[] = [];
  for (const [path, after] of hm) {
    const before = bm.get(path);
    if (before === undefined) changes.push({ path, type: "add", after });
    else if (before !== after) changes.push({ path, type: "modify", before, after });
  }
  for (const [path, before] of bm) if (!hm.has(path)) changes.push({ path, type: "delete", before });
  return changes.sort((x, y) => x.path.localeCompare(y.path));
}

export const shortId = (id: string) => id.replace(/-/g, "").slice(0, 7);
