// "Build with your own AI": chat with Gemini or OpenAI about a repo and apply the
// file changes it proposes. Keys stay in this browser and go straight to the provider.
import { cleanPath, looksBinary, type Change } from "@/lib/repo";

export type AiProvider = "gemini" | "openai";
export type AiSettings = { provider: AiProvider; geminiKey: string; openaiKey: string; geminiModel: string; openaiModel: string };
export type AiFileChange = { path: string; action: "write" | "delete"; content?: string };
export type AiResult = { reply: string; changes: AiFileChange[] };
export type ChatTurn = { role: "user" | "assistant"; content: string };

export const DEFAULT_AI_SETTINGS: AiSettings = { provider: "gemini", geminiKey: "", openaiKey: "", geminiModel: "gemini-2.5-flash", openaiModel: "gpt-5-mini" };
const STORAGE_KEY = "pastodev-ai-settings";

export function loadAiSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;
  try { return { ...DEFAULT_AI_SETTINGS, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<AiSettings>) }; }
  catch { return DEFAULT_AI_SETTINGS; }
}
export function saveAiSettings(s: AiSettings) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
export const activeKey = (s: AiSettings) => (s.provider === "gemini" ? s.geminiKey : s.openaiKey).trim();

export const SYSTEM_PROMPT = `Kamu adalah asisten coding di Pastodev, seperti AI builder. Kamu membantu pemilik repositori membangun fitur baru dan memperbaiki bug.
Selalu balas HANYA dengan satu objek JSON valid, tanpa teks lain, dengan bentuk:
{"reply": "penjelasan singkat dalam bahasa pengguna (markdown boleh)", "changes": [{"path": "folder/file.ext", "action": "write", "content": "ISI FILE LENGKAP"}, {"path": "file/lama.ext", "action": "delete"}]}
Aturan:
- "write" membuat atau mengganti file; "content" harus berisi SELURUH isi file akhir, bukan potongan atau diff.
- Ubah hanya file yang perlu. Kalau pengguna cuma bertanya, kirim "changes": [].
- Path relatif dari akar repo, tanpa "/" di depan.
- Jaga gaya kode yang sudah ada.`;

/** Packs the repo into the prompt: every path, plus file contents until the size budget runs out. */
export function buildRepoContext(files: { path: string; content: string }[], budget = 150_000) {
  const text = files.filter((f) => !looksBinary(f.content));
  const sorted = [...text].sort((a, b) => a.content.length - b.content.length);
  const included = new Set<string>();
  let used = 0;
  for (const f of sorted) {
    if (used + f.content.length > budget) continue;
    included.add(f.path);
    used += f.content.length;
  }
  const tree = files.map((f) => f.path).sort().join("\n");
  const bodies = text.filter((f) => included.has(f.path)).sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `=== FILE: ${f.path} ===\n${f.content}`).join("\n\n");
  return { prompt: `DAFTAR FILE REPO:\n${tree || "(repo kosong)"}\n\nISI FILE:\n${bodies}`, includedCount: included.size, total: files.length };
}

/** Reads the model's JSON answer, tolerating code fences or text around it. */
export function parseAiResult(raw: string): AiResult {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return { reply: raw.trim(), changes: [] };
  s = s.slice(start, end + 1);
  let obj: unknown;
  try { obj = JSON.parse(s); } catch { return { reply: raw.trim(), changes: [] }; }
  const o = obj as { reply?: unknown; changes?: unknown };
  const changes: AiFileChange[] = [];
  if (Array.isArray(o.changes)) {
    for (const c of o.changes as { path?: unknown; action?: unknown; content?: unknown }[]) {
      const path = typeof c?.path === "string" ? cleanPath(c.path) : null;
      if (!path) continue;
      if (c.action === "delete") changes.push({ path, action: "delete" });
      else if (typeof c.content === "string") changes.push({ path, action: "write", content: c.content });
    }
  }
  return { reply: typeof o.reply === "string" ? o.reply : "", changes };
}

/** Turns the AI's proposal into repo changes against the current files, dropping no-ops. */
export function toRepoChanges(files: { path: string; content: string }[], proposed: AiFileChange[]): Change[] {
  const current = new Map(files.map((f) => [f.path, f.content]));
  const out = new Map<string, Change>();
  for (const c of proposed) {
    const before = current.get(c.path);
    if (c.action === "delete") {
      if (before !== undefined) out.set(c.path, { path: c.path, type: "delete", before });
      else out.delete(c.path);
    } else if (before === undefined) out.set(c.path, { path: c.path, type: "add", after: c.content ?? "" });
    else if (before !== c.content) out.set(c.path, { path: c.path, type: "modify", before, after: c.content ?? "" });
    else out.delete(c.path);
  }
  return [...out.values()];
}

async function failure(res: Response, who: string) {
  const text = await res.text();
  let msg = text;
  try { const j = JSON.parse(text); msg = j?.error?.message ?? j?.[0]?.error?.message ?? text; } catch { /* keep text */ }
  if (res.status === 401 || res.status === 403) msg = `API key ${who} ditolak: ${msg}`;
  if (res.status === 429) msg = `Kuota/batas ${who} habis: ${msg}`;
  return new Error(`${who} ${res.status}: ${String(msg).slice(0, 400)}`);
}

/** Sends the conversation to the chosen provider and returns its raw text answer. */
export async function callAi(s: AiSettings, turns: ChatTurn[], signal?: AbortSignal): Promise<string> {
  const key = activeKey(s);
  if (!key) throw new Error("Masukkan API key dulu di Pengaturan AI.");
  if (s.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal: signal ?? null,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: s.openaiModel.trim() || DEFAULT_AI_SETTINGS.openaiModel, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...turns] }),
    });
    if (!res.ok) throw await failure(res, "OpenAI");
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content ?? "";
  }
  const model = encodeURIComponent(s.geminiModel.trim() || DEFAULT_AI_SETTINGS.geminiModel);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", signal: signal ?? null,
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw await failure(res, "Gemini");
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}
