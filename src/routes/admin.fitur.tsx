import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Globe,
  Loader2,
  Megaphone,
  MessagesSquare,
  PowerOff,
  RefreshCw,
  Search,
  Store,
  TriangleAlert,
  UserPlus,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import {
  FEATURES,
  isFeatureOn,
  type FeatureDef,
  type FeatureFlags,
  type FeatureKey,
} from "@/lib/features";
import { siteConfigQuery } from "@/lib/site-config.functions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GobiLoader } from "@/components/gobi-loader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/fitur")({
  head: () => ({
    meta: [{ title: "Fitur & pengumuman — Admin GoBi" }, { name: "robots", content: "noindex" }],
  }),
  component: FeaturesPage,
});

const GROUPS = [...new Set(FEATURES.map((f) => f.group))];
const GROUP_ICON: Record<FeatureDef["group"], LucideIcon> = {
  Umum: Globe,
  Akun: UserPlus,
  Kode: GitBranch,
  Komunitas: MessagesSquare,
  Marketplace: Store,
  "Tools developer": Wrench,
};

type Filter = "semua" | "aktif" | "mati";
type Confirm = { title: string; body: string; keys: FeatureKey[]; enabled: boolean } | null;

/** Apakah situs publik (yang dibaca pengunjung lewat server) sudah mengikuti pengaturan yang tersimpan di database? */
function PublicSync({ flags }: { flags: FeatureFlags | undefined }) {
  const pub = useQuery(siteConfigQuery);
  const cfg = pub.data;
  const mismatched =
    flags && cfg && !cfg.error
      ? FEATURES.filter((f) => isFeatureOn(flags, f.key) !== isFeatureOn(cfg.flags, f.key))
      : [];
  const failure = pub.isError ? errMsg(pub.error) : (cfg?.error ?? null);

  let tone: "ok" | "warn" | "bad" = "ok";
  let body: React.ReactNode = "Situs publik sudah mengikuti pengaturan di halaman ini.";
  if (failure) {
    tone = "bad";
    body = (
      <>
        Situs publik <b>tidak bisa membaca</b> pengaturan, jadi semua fitur dianggap menyala dan pengumuman tidak tampil.
        <span className="mt-1 block text-xs">Penyebab: {failure}</span>
      </>
    );
  } else if (mismatched.length > 0) {
    tone = "warn";
    body = (
      <>
        Situs publik belum mengikuti {mismatched.length} saklar: {mismatched.map((f) => f.label).join(", ")}.
        <span className="mt-1 block text-xs">Perubahan baru biasanya sampai dalam sekitar satu menit. Tekan Periksa ulang; kalau tetap berbeda, cek variabel lingkungan server.</span>
      </>
    );
  }

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3 text-sm",
        tone === "ok" && "border-success/40 bg-success/10",
        tone === "warn" && "border-warning/40 bg-warning/15",
        tone === "bad" && "border-destructive/40 bg-destructive/10",
      )}
    >
      <p className="flex min-w-0 flex-1 items-start gap-2">
        {tone === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", tone === "bad" ? "text-destructive" : "text-warning")} />}
        <span className="min-w-0">{pub.isFetching && !cfg ? "Memeriksa situs publik…" : body}</span>
      </p>
      <Button type="button" size="sm" variant="outline" disabled={pub.isFetching} onClick={() => void pub.refetch()}>
        <RefreshCw className={cn(pub.isFetching && "animate-spin")} /> Periksa ulang
      </Button>
    </div>
  );
}

function FeaturesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");
  const [confirm, setConfirm] = useState<Confirm>(null);

  const {
    data: flags,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["admin-flags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("feature_flags").select("key,enabled");
      if (error) throw error;
      const out: FeatureFlags = {};
      for (const r of data ?? []) out[r.key] = r.enabled;
      return out;
    },
  });

  const offCount = FEATURES.filter((f) => !isFeatureOn(flags, f.key)).length;
  const onCount = FEATURES.length - offCount;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FEATURES.filter((f) => {
      const on = isFeatureOn(flags, f.key);
      if (filter === "aktif" && !on) return false;
      if (filter === "mati" && on) return false;
      if (!q) return true;
      return [f.label, f.description, f.group, ...f.paths, ...(f.examples ?? [])].some((t) => t.toLowerCase().includes(q));
    });
  }, [flags, query, filter]);

  /** Menyimpan satu atau banyak saklar. Tampilan langsung berubah, dan dikembalikan bila database menolak. */
  async function save(keys: FeatureKey[], enabled: boolean) {
    if (keys.length === 0) return;
    const previous = qc.getQueryData<FeatureFlags>(["admin-flags"]) ?? {};
    qc.setQueryData<FeatureFlags>(["admin-flags"], {
      ...previous,
      ...Object.fromEntries(keys.map((k) => [k, enabled])),
    });
    setBusyKeys((s) => new Set([...s, ...keys]));
    const now = new Date().toISOString();
    // .select() supaya penolakan diam-diam oleh kebijakan database (nol baris tersimpan) ikut terdeteksi.
    const { data: saved, error } = await supabase
      .from("feature_flags")
      .upsert(
        keys.map((key) => ({ key, enabled, updated_by: user?.id ?? null, updated_at: now })),
        { onConflict: "key" },
      )
      .select("key");
    setBusyKeys((s) => {
      const n = new Set(s);
      keys.forEach((k) => n.delete(k));
      return n;
    });
    const failed = error ? errMsg(error) : (saved ?? []).length < keys.length ? "Database menolak sebagian perubahan: akun admin belum punya izin menulis ke feature_flags." : null;
    if (failed) {
      qc.setQueryData(["admin-flags"], previous);
      toast.error(failed);
      void qc.invalidateQueries({ queryKey: ["admin-flags"] });
      return;
    }
    toast.success(
      keys.length === 1
        ? enabled
          ? "Fitur dinyalakan"
          : "Fitur dimatikan"
        : `${keys.length} fitur ${enabled ? "dinyalakan" : "dimatikan"}`,
    );
    qc.invalidateQueries({ queryKey: ["admin-flags"] });
    qc.invalidateQueries({ queryKey: ["site-config"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  }

  /** Mematikan fitur menyembunyikannya dari pengguna, jadi selalu minta konfirmasi. Menyalakan langsung jalan. */
  function request(keys: FeatureKey[], enabled: boolean) {
    const targets = keys.filter((k) => isFeatureOn(flags, k) !== enabled);
    if (targets.length === 0) {
      toast.info(enabled ? "Semua fitur di sini sudah menyala" : "Semua fitur di sini sudah mati");
      return;
    }
    if (enabled) {
      void save(targets, true);
      return;
    }
    const defs = targets.map((k) => FEATURES.find((f) => f.key === k)).filter((f): f is FeatureDef => !!f);
    const names = defs.map((f) => f.label);
    const special = defs.find((f) => f.confirm);
    setConfirm({
      title: targets.length === 1 ? `Matikan “${names[0]}”?` : `Matikan ${targets.length} fitur?`,
      body:
        (special?.confirm ? `${special.confirm} ` : "") +
        `${names.join(", ")} akan ditutup untuk pengguna biasa: halamannya menampilkan “dinonaktifkan”. Konten yang sudah ada tidak dihapus, dan kamu bisa menyalakannya lagi kapan saja.`,
      keys: targets,
      enabled: false,
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-semibold">Fitur & halaman</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Fitur yang dimatikan menampilkan “dinonaktifkan” di halamannya. Pada fitur tanpa tanda
              “Tutup halaman saja”, penambahan konten baru juga ditolak oleh database. Konten yang sudah ada
              tidak dihapus. Admin tetap bisa mengaksesnya. Pengunjung lain melihat perubahan dalam sekitar
              satu menit.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-sm" aria-live="polite">
            <div className="text-center">
              <p className="font-mono text-2xl font-bold text-primary">{onCount}</p>
              <p className="text-xs text-muted-foreground">Menyala</p>
            </div>
            <div className="text-center">
              <p
                className={cn(
                  "font-mono text-2xl font-bold",
                  offCount ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {offCount}
              </p>
              <p className="text-xs text-muted-foreground">Mati</p>
            </div>
          </div>
        </div>
        <Progress
          value={(onCount / FEATURES.length) * 100}
          className="mt-4 h-1.5"
          aria-label={`${onCount} dari ${FEATURES.length} fitur menyala`}
        />
        {offCount > 0 && (
          <p
            className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/15 p-3 text-sm"
            role="status"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              {offCount} fitur sedang dimatikan. Pengguna biasa tidak bisa memakainya sampai kamu
              menyalakannya lagi.
            </span>
          </p>
        )}
      </section>

      <PublicSync flags={flags} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari fitur, kelompok, atau halaman…"
            className="pl-9"
            aria-label="Cari fitur"
          />
        </div>
        <div
          className="flex rounded-md border border-input p-0.5"
          role="group"
          aria-label="Filter status"
        >
          {(["semua", "aktif", "mati"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="Muat ulang status fitur"
        >
          <RefreshCw className={cn(isFetching && "animate-spin")} /> Muat ulang
        </Button>
      </div>

      {isLoading && <GobiLoader />}
      {isError && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <p className="font-medium text-destructive">Status fitur gagal dimuat.</p>
          <p className="mt-1 text-muted-foreground">{errMsg(error)}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => void refetch()}>
            Coba lagi
          </Button>
        </div>
      )}

      {!isLoading && !isError && visible.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Tidak ada fitur yang cocok dengan pencarian atau filter ini.
        </p>
      )}

      {!isError &&
        GROUPS.map((g) => {
          const items = visible.filter((f) => f.group === g);
          if (items.length === 0) return null;
          const all = FEATURES.filter((f) => f.group === g);
          const groupOn = all.filter((f) => isFeatureOn(flags, f.key)).length;
          const Icon = GROUP_ICON[g];
          // Mode perawatan tidak ikut "Matikan semua" supaya satu klik tidak menutup seluruh situs.
          const bulk = all.filter((f) => f.key !== "situs");
          const bulkOn = bulk.filter((f) => isFeatureOn(flags, f.key)).length;
          return (
            <section
              key={g}
              className="rounded-xl border border-border bg-card p-5"
              aria-labelledby={`grp-${g}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3
                  id={`grp-${g}`}
                  className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  <Icon className="size-4" /> {g}{" "}
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs normal-case tracking-normal">
                    {groupOn}/{all.length} menyala
                  </span>
                </h3>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isLoading || bulkOn === bulk.length}
                    onClick={() =>
                      request(
                        bulk.map((f) => f.key),
                        true,
                      )
                    }
                  >
                    <Zap /> Nyalakan semua
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={isLoading || bulkOn === 0}
                    onClick={() =>
                      request(
                        bulk.map((f) => f.key),
                        false,
                      )
                    }
                  >
                    <PowerOff /> Matikan semua
                  </Button>
                </div>
              </div>
              <ul className="mt-3 divide-y divide-border">
                {items.map((f) => {
                  const on = isFeatureOn(flags, f.key);
                  const busy = busyKeys.has(f.key);
                  return (
                    <li key={f.key} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {f.label}
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-semibold",
                              on
                                ? "bg-primary/10 text-primary"
                                : "bg-destructive/10 text-destructive",
                            )}
                          >
                            {on ? "Menyala" : "Mati"}
                          </span>
                          {f.pageOnly && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" title="Hanya menutup halaman atau tampilan; belum ada pengunci di database.">
                              Tutup halaman saja
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{f.description}</p>
                        {(f.paths.length > 0 || (f.examples?.length ?? 0) > 0) && (
                          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
                            {f.paths.map((p) => (
                              <a
                                key={p}
                                href={p}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 hover:text-primary hover:underline"
                                title={`Buka ${p} di tab baru`}
                              >
                                {p}
                                <ExternalLink className="size-3" />
                              </a>
                            ))}
                            {f.examples?.map((p) => <span key={p}>{p}</span>)}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 pt-0.5">
                        {busy && (
                          <Loader2
                            className="size-4 animate-spin text-muted-foreground"
                            aria-hidden
                          />
                        )}
                        <Switch
                          checked={on}
                          disabled={busy || isLoading}
                          onCheckedChange={(v) => request([f.key], v)}
                          aria-label={`${on ? "Matikan" : "Nyalakan"} ${f.label}`}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

      <AnnouncementForm />

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirm) void save(confirm.keys, confirm.enabled);
                setConfirm(null);
              }}
            >
              Ya, matikan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const MAX_ANNOUNCEMENT = 500;
const TEMPLATES: { label: string; level: "info" | "warning"; text: string }[] = [
  { label: "Perawatan terjadwal", level: "warning", text: "Perawatan terjadwal: GoBi mungkin tidak bisa diakses sebentar. Mohon maaf atas ketidaknyamanannya." },
  { label: "Gangguan", level: "warning", text: "Sebagian fitur sedang terganggu. Tim kami sedang memperbaikinya." },
  { label: "Fitur baru", level: "info", text: "Ada fitur baru di GoBi! Coba sekarang dan beri tahu kami pendapatmu." },
];

// Akses ke app_settings tidak ada di tipe yang dihasilkan untuk operasi tulis ini, jadi pakai klien longgar.
const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any

function AnnouncementForm() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [level, setLevel] = useState<"info" | "warning">("info");
  const [busy, setBusy] = useState(false);
  const pub = useQuery(siteConfigQuery);
  const { data } = useQuery({
    queryKey: ["admin-announcement"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("announcement,announcement_level,updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!data) return;
    setText(data.announcement ?? "");
    setLevel(data.announcement_level === "warning" ? "warning" : "info");
  }, [data?.updated_at, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = (data?.announcement ?? "").trim();
  const savedLevel = data?.announcement_level === "warning" ? "warning" : "info";
  const dirty = text.trim() !== live || (live !== "" && level !== savedLevel);

  // Yang benar-benar dibaca pengunjung lewat server. Berbeda dari yang tersimpan = pengumuman tidak sampai.
  const cfg = pub.data;
  const pubText = (cfg?.announcement ?? "").trim();
  const pubMatches = !!cfg && !cfg.error && pubText === live && (live === "" || cfg.announcementLevel === savedLevel);

  /** Menulis ke app_settings dan memastikan barisnya benar-benar berubah (nol baris = ditolak diam-diam, atau barisnya belum ada). */
  async function persist(value: string | null) {
    const row = { announcement: value, announcement_level: level, updated_at: new Date().toISOString() };
    const upd = await db.from("app_settings").update(row).eq("id", 1).select("id");
    if (upd.error) throw upd.error;
    if ((upd.data ?? []).length > 0) return;
    const ins = await db.from("app_settings").insert({ id: 1, ...row }).select("id");
    if (ins.error) throw ins.error;
    if ((ins.data ?? []).length === 0) throw new Error("Database menolak perubahan: akun admin belum punya izin menulis ke app_settings.");
  }

  async function save(e?: React.FormEvent, clear = false) {
    e?.preventDefault();
    const value = clear ? null : text.trim() || null;
    setBusy(true);
    try {
      await persist(value);
    } catch (err) {
      setBusy(false);
      toast.error(errMsg(err));
      return;
    }
    if (clear) setText("");
    await qc.invalidateQueries({ queryKey: ["admin-announcement"] });
    // Baca ulang seperti pengunjung membacanya, lalu bandingkan.
    let reached = false;
    try {
      const fresh = await qc.fetchQuery({ ...siteConfigQuery, staleTime: 0 });
      reached = !fresh.error && (fresh.announcement ?? "") === (value ?? "") && (!value || fresh.announcementLevel === level);
    } catch {
      reached = false;
    }
    setBusy(false);
    if (reached) toast.success(value ? "Pengumuman tampil di seluruh situs" : "Pengumuman dihapus");
    else toast.warning("Pengumuman tersimpan, tetapi situs publik belum membacanya. Lihat keterangan di bawah form.");
  }

  const warn = level === "warning";
  const PreviewIcon = warn ? TriangleAlert : Megaphone;

  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Megaphone className="size-4 text-primary" /> Pengumuman situs
        </h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            live ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {live ? "Tersimpan" : "Tidak ada pengumuman"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Banner di bagian atas semua halaman pengunjung (halaman admin tidak menampilkannya). Kosongkan lalu simpan untuk menghapusnya.
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Contoh cepat:</span>
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => { setText(t.text); setLevel(t.level); }}
            className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition hover:bg-accent"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        <Label htmlFor="ann-text">Isi pengumuman</Label>
        <Textarea
          id="ann-text"
          rows={3}
          maxLength={MAX_ANNOUNCEMENT}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Contoh: Pembayaran sedang dalam perawatan sampai pukul 22.00."
        />
        <p className="mt-1 text-right font-mono text-xs text-muted-foreground">
          {text.length}/{MAX_ANNOUNCEMENT}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="ann-level" className="mr-1">
          Jenis
        </Label>
        <select
          id="ann-level"
          value={level}
          onChange={(e) => setLevel(e.target.value === "warning" ? "warning" : "info")}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="info">Info</option>
          <option value="warning">Peringatan</option>
        </select>
        <div className="ml-auto flex gap-2">
          {live && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void save(undefined, true)}
            >
              Hapus pengumuman
            </Button>
          )}
          <Button disabled={busy || !dirty}>
            {busy && <Loader2 className="animate-spin" />} Simpan pengumuman
          </Button>
        </div>
      </div>

      {text.trim() && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pratinjau
          </p>
          <div
            role="note"
            className={cn(
              "rounded-md border px-4 py-2 text-sm",
              warn ? "border-warning/40 bg-warning/15" : "border-primary/30 bg-primary/10",
            )}
          >
            <p className="flex items-start gap-2">
              <PreviewIcon
                className={cn("mt-0.5 size-4 shrink-0", warn ? "text-warning" : "text-primary")}
              />
              <span className="min-w-0 whitespace-pre-line break-words">{text}</span>
            </p>
          </div>
        </div>
      )}

      <div
        role="status"
        className={cn(
          "flex flex-wrap items-start justify-between gap-3 rounded-md border p-3 text-sm",
          cfg?.error ? "border-destructive/40 bg-destructive/10" : pubMatches ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/15",
        )}
      >
        <p className="min-w-0 flex-1">
          {!cfg ? (
            "Memeriksa apa yang dilihat pengunjung…"
          ) : cfg.error ? (
            <>Situs publik tidak bisa membaca pengaturan, jadi pengumuman tidak tampil. <span className="block text-xs">Penyebab: {cfg.error}</span></>
          ) : pubMatches ? (
            live ? "Pengumuman ini sedang tampil di situs publik." : "Tidak ada pengumuman di situs publik."
          ) : (
            <>Yang dilihat pengunjung berbeda dari yang tersimpan{pubText ? ` (saat ini: “${pubText.slice(0, 60)}${pubText.length > 60 ? "…" : ""}”)` : " (saat ini: tidak ada pengumuman)"}. Perubahan biasanya sampai dalam sekitar satu menit; tekan Periksa ulang.</>
          )}
        </p>
        <Button type="button" size="sm" variant="outline" disabled={pub.isFetching} onClick={() => void pub.refetch()}>
          <RefreshCw className={cn(pub.isFetching && "animate-spin")} /> Periksa ulang
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Mau melihat hasilnya langsung?{" "}
        <Link to="/" className="underline hover:text-primary">
          Buka beranda
        </Link>
        .
      </p>
    </form>
  );
}
