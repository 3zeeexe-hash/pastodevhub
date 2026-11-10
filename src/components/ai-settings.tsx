import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { DEFAULT_AI_SETTINGS, loadAiSettings, saveAiSettings, type AiProvider, type AiSettings } from "@/lib/ai-repo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function useAiSettings() {
  const [s, setS] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  useEffect(() => { setS(loadAiSettings()); }, []);
  return [s, (next: AiSettings) => { saveAiSettings(next); setS(next); }] as const;
}

export function AiSettingsPanel({ settings, onSave }: { settings: AiSettings; onSave: (s: AiSettings) => void }) {
  const [f, setF] = useState(settings);
  useEffect(() => setF(settings), [settings]);
  const opt = (p: AiProvider, label: string) => (
    <button type="button" onClick={() => setF({ ...f, provider: p })}
      className={cn("flex-1 rounded-md border px-3 py-2 text-sm", f.provider === p ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground")}>{label}</button>
  );
  return (
    <form className="space-y-4 rounded-xl border border-border bg-card p-4" onSubmit={(e) => { e.preventDefault(); onSave(f); toast.success("Pengaturan AI disimpan di perangkat ini"); }}>
      <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="size-4 text-primary" /> Pengaturan AI</h2>
      <div className="flex gap-2">{opt("gemini", "Google Gemini")}{opt("openai", "OpenAI")}</div>
      {f.provider === "gemini" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="gk">Gemini API key</Label><Input id="gk" type="password" autoComplete="off" value={f.geminiKey} onChange={(e) => setF({ ...f, geminiKey: e.target.value })} placeholder="AIza…" /></div>
          <div><Label htmlFor="gm">Model</Label><Input id="gm" value={f.geminiModel} onChange={(e) => setF({ ...f, geminiModel: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Buat key di <a className="text-link underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer noopener">Google AI Studio</a>.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="ok">OpenAI API key</Label><Input id="ok" type="password" autoComplete="off" value={f.openaiKey} onChange={(e) => setF({ ...f, openaiKey: e.target.value })} placeholder="sk-…" /></div>
          <div><Label htmlFor="om">Model</Label><Input id="om" value={f.openaiModel} onChange={(e) => setF({ ...f, openaiModel: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Buat key di <a className="text-link underline" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer noopener">OpenAI Platform</a>.</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Key hanya disimpan di browser ini dan dikirim langsung ke Google/OpenAI — tidak pernah ke server Pastodev. Biaya pemakaian ditagih ke akun AI kamu.</p>
      <Button size="sm">Simpan</Button>
    </form>
  );
}
