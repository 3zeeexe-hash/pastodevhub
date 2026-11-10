import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Check, Loader2, Send, Settings2, Square, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { commitChanges, useRepo, useRefreshRepo } from "@/lib/repo-data";
import { diffStats, type Change } from "@/lib/repo";
import { activeKey, buildRepoContext, callAi, parseAiResult, toRepoChanges, type ChatTurn } from "@/lib/ai-repo";
import { errorText } from "@/lib/github-client";
import { AiSettingsPanel, useAiSettings } from "@/components/ai-settings";
import { DiffView } from "@/components/diff-view";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/$username_/$repo/ai")({
  head: ({ params }) => ({
    meta: [
      { title: `AI · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: "Bangun dan perbaiki kode repositori dengan AI milikmu sendiri." },
      { property: "og:title", content: `AI · ${params.username}/${params.repo}` },
      { property: "og:description", content: "Chat dengan Gemini atau OpenAI untuk mengubah kode repo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RepoAi,
});

type Msg = { role: "user" | "assistant"; text: string; changes?: Change[]; applied?: boolean; error?: boolean };

const IDEAS = ["Jelaskan struktur proyek ini", "Buat halaman landing index.html yang modern", "Cari dan perbaiki bug di kode ini", "Tambahkan README yang lengkap"];

function RepoAi() {
  const { username, repo } = Route.useParams();
  const { user } = useAuth();
  const { data: rd } = useRepo(username, repo);
  const refresh = useRefreshRepo(username, repo);
  const [settings, setSettings] = useAiSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  if (!rd) return null;
  if (!rd.isOwner) return <p className="text-muted-foreground">Hanya pemilik repositori yang bisa memakai AI di sini.</p>;
  const hasKey = !!activeKey(settings);
  const ctx = buildRepoContext(rd.files);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    if (!hasKey) { setShowSettings(true); toast.error("Masukkan API key Gemini atau OpenAI dulu."); return; }
    const next: Msg[] = [...msgs, { role: "user", text: prompt }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    abort.current = new AbortController();
    try {
      // Earlier turns go as plain text; the fresh repo snapshot rides on the newest message.
      const history: ChatTurn[] = msgs.filter((m) => !m.error).slice(-10).map((m) => ({
        role: m.role,
        content: m.role === "assistant" && m.changes?.length ? `${m.text}\n(Mengusulkan perubahan: ${m.changes.map((c) => c.path).join(", ")}${m.applied ? " — sudah diterapkan" : ""})` : m.text,
      }));
      const { prompt: repoCtx } = buildRepoContext(rd!.files);
      const raw = await callAi(settings, [...history, { role: "user", content: `${repoCtx}\n\nPERMINTAAN:\n${prompt}` }], abort.current.signal);
      const result = parseAiResult(raw);
      const changes = toRepoChanges(rd!.files, result.changes);
      setMsgs([...next, { role: "assistant", text: result.reply || (changes.length ? "Berikut perubahan yang saya usulkan." : "(AI tidak memberi jawaban)"), changes }]);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      setMsgs([...next, { role: "assistant", text: aborted ? "Dihentikan." : errorText(e), error: true }]);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  async function apply(i: number) {
    const m = msgs[i];
    if (!m?.changes?.length || !user) return;
    setApplying(i);
    try {
      const ask = [...msgs.slice(0, i)].reverse().find((x) => x.role === "user")?.text ?? "Perubahan dari AI";
      await commitChanges({ repoId: rd!.repo.id, authorId: user.id, message: `AI: ${ask.split("\n")[0]!.slice(0, 120)}`, changes: m.changes });
      setMsgs(msgs.map((x, j) => (j === i ? { ...x, applied: true } : x)));
      toast.success(`${m.changes.length} file diterapkan sebagai commit baru`);
      refresh();
    } catch (e) { toast.error(errorText(e)); } finally { setApplying(null); }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Bot className="size-5 text-primary" /> Bangun dengan AI</h2>
          <p className="text-xs text-muted-foreground">
            {settings.provider === "gemini" ? `Gemini · ${settings.geminiModel}` : `OpenAI · ${settings.openaiModel}`} · AI membaca {ctx.includedCount} dari {ctx.total} file
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowSettings(!showSettings)}><Settings2 /> Pengaturan AI</Button>
      </div>
      {(showSettings || !hasKey) && <AiSettingsPanel settings={settings} onSave={(s) => { setSettings(s); setShowSettings(false); }} />}

      <div className="space-y-4">
        {msgs.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">Minta AI membuat fitur, memperbaiki bug, atau menjelaskan kode. Kamu cek dulu perubahannya sebelum diterapkan.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {IDEAS.map((t) => <Button key={t} size="sm" variant="secondary" onClick={() => send(t)} disabled={busy}>{t}</Button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className="flex gap-3">
            <span className={m.role === "user" ? "mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary" : "mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"}>
              {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              {m.role === "user" ? <p className="whitespace-pre-wrap text-sm">{m.text}</p> : (
                <div className={m.error ? "rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" : "text-sm"}>
                  {m.error ? m.text : <Markdown>{m.text}</Markdown>}
                </div>
              )}
              {!!m.changes?.length && (
                <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{m.changes.length} file berubah <span className="font-mono text-xs"><span className="text-success">+{diffStats(m.changes).add}</span> <span className="text-destructive">−{diffStats(m.changes).del}</span></span></p>
                    {m.applied ? <span className="flex items-center gap-1 text-sm text-success"><Check className="size-4" /> Diterapkan</span> : (
                      <Button size="sm" onClick={() => apply(i)} disabled={applying !== null}>{applying === i && <Loader2 className="animate-spin" />} Terapkan ke repo</Button>
                    )}
                  </div>
                  <DiffView changes={m.changes} />
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> AI sedang bekerja…</p>}
      </div>

      <form className="sticky bottom-3 flex gap-2 rounded-xl border border-border bg-card p-2 shadow-lg" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Contoh: buat halaman kontak dengan form, lalu tautkan dari index.html"
          className="min-h-[52px] flex-1 resize-none border-0 bg-transparent focus-visible:ring-0" maxLength={8000}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        {busy
          ? <Button type="button" variant="secondary" onClick={() => abort.current?.abort()} aria-label="Hentikan"><Square /></Button>
          : <Button aria-label="Kirim" disabled={!input.trim()}><Send /></Button>}
      </form>
      <p className="text-center text-xs text-muted-foreground">Repo lain? Buka dari <Link to="/studio/ai" className="text-link hover:underline">Studio → AI untuk repo</Link>.</p>
    </div>
  );
}
