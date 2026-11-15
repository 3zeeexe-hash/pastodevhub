import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  GitBranch,
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
  Akun: UserPlus,
  Kode: GitBranch,
  Komunitas: MessagesSquare,
  Marketplace: Store,
  "Tools developer": Wrench,
};

type Filter = "semua" | "aktif" | "mati";
type Confirm = { title: string; body: string; keys: FeatureKey[]; enabled: boolean } | null;

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
      return [f.label, f.description, f.group, ...f.paths].some((t) => t.toLowerCase().includes(q));
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
    const { error } = await supabase.from("feature_flags").upsert(
      keys.map((key) => ({ key, enabled, updated_by: user?.id ?? null, updated_at: now })),
      { onConflict: "key" },
    );
    setBusyKeys((s) => {
      const n = new Set(s);
      keys.forEach((k) => n.delete(k));
      return n;
    });
    if (error) {
      qc.setQueryData(["admin-flags"], previous);
      toast.error(errMsg(error));
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
    const names = targets.map((k) => FEATURES.find((f) => f.key === k)?.label ?? k);
    setConfirm({
      title: targets.length === 1 ? `Matikan “${names[0]}”?` : `Matikan ${targets.length} fitur?`,
      body: `${names.join(", ")} akan hilang dari menu dan halamannya menampilkan “dinonaktifkan” untuk pengguna biasa. Konten yang sudah ada tidak dihapus, dan kamu bisa menyalakannya lagi kapan saja.`,
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
              Fitur yang dimatikan hilang dari menu, halamannya menampilkan “dinonaktifkan”, dan
              penambahan konten baru ditolak oleh database. Konten yang sudah ada tidak dihapus.
              Admin tetap bisa mengaksesnya. Pengunjung lain melihat perubahan dalam sekitar satu
              menit.
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
                    disabled={isLoading || groupOn === all.length}
                    onClick={() =>
                      request(
                        all.map((f) => f.key),
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
                    disabled={isLoading || groupOn === 0}
                    onClick={() =>
                      request(
                        all.map((f) => f.key),
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
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{f.description}</p>
                        {f.paths.length > 0 && (
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

function AnnouncementForm() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [level, setLevel] = useState<"info" | "warning">("info");
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["admin-announcement"],
    queryFn: async () =>
      (
        await supabase
          .from("app_settings")
          .select("announcement,announcement_level,updated_at")
          .eq("id", 1)
          .maybeSingle()
      ).data,
  });
  useEffect(() => {
    if (!data) return;
    setText(data.announcement ?? "");
    setLevel(data.announcement_level === "warning" ? "warning" : "info");
  }, [data?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = (data?.announcement ?? "").trim();
  const dirty =
    text.trim() !== live ||
    (live !== "" && level !== (data?.announcement_level === "warning" ? "warning" : "info"));

  async function save(e?: React.FormEvent, clear = false) {
    e?.preventDefault();
    const value = clear ? "" : text.trim();
    setBusy(true);
    const { error } = await supabase
      .from("app_settings")
      .update({
        announcement: value || null,
        announcement_level: level,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setBusy(false);
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    if (clear) setText("");
    toast.success(value ? "Pengumuman tampil di seluruh situs" : "Pengumuman dihapus");
    qc.invalidateQueries({ queryKey: ["admin-announcement"] });
    qc.invalidateQueries({ queryKey: ["site-config"] });
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
          {live ? "Sedang tampil" : "Tidak ada pengumuman"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Banner di bagian atas semua halaman. Kosongkan lalu simpan untuk menghapusnya.
      </p>
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
              <span className="min-w-0 whitespace-pre-line">{text}</span>
            </p>
          </div>
        </div>
      )}
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
