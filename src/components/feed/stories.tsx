import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, ChevronLeft, ChevronRight, Eye, ImagePlus, Loader2, Pause, Play, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { timeAgo, useAuth } from "@/lib/auth";
import { errMsg, uploadMedia } from "@/lib/market";
import {
  STORY_BGS, STORY_BG_CLASS, STORY_DURATION_MS, STORY_MAX_CHARS, createStory, deleteStory, fetchStoryGroups,
  fetchStoryViewCount, markStoryViewed, storyTimeLeft, type StoryBg, type StoryGroup,
} from "@/lib/stories";
import { AvatarMini } from "@/components/avatar-mini";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const BG_LABEL: Record<StoryBg, string> = { senja: "Oranye", malam: "Biru tua", laut: "Biru", hutan: "Abu-abu", mawar: "Api" };

export function useStoryGroups() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["stories", user?.id ?? null],
    queryFn: () => fetchStoryGroups(user?.id ?? null),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}

/** Ukuran kartu seragam untuk semua item di baris story, supaya tinggi dan jarak selalu rata. */
export const STORY_CARD = "relative h-44 w-28 shrink-0 snap-start overflow-hidden rounded-2xl text-left shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-48 sm:w-32";

/**
 * Satu kartu story (potret 9:16 ala Facebook): latar = gambar atau warna story terbaru, avatar bercincin di kiri atas
 * (oranye = belum dilihat, putih redup = sudah dilihat), nama di bawah, dan angka kalau lebih dari satu story.
 */
export function StoryCard({ group, onOpen }: { group: StoryGroup; onOpen: () => void }) {
  const name = group.isMine ? "Story kamu" : group.author.display_name || group.author.username;
  const latest = group.stories[group.stories.length - 1]!;
  const bg = (STORY_BGS as readonly string[]).includes(latest.bg) ? (latest.bg as StoryBg) : "senja";
  return (
    <button type="button" onClick={onOpen} className={cn(STORY_CARD, "group text-header-foreground")} aria-label={`Lihat story ${name}`}>
      {latest.image_url
        ? <img src={latest.image_url} alt="" loading="lazy" draggable={false} className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-105" />
        : <span className={cn("absolute inset-0", STORY_BG_CLASS[bg])} />}
      {!latest.image_url && latest.body && (
        <span className="absolute inset-x-3 top-1/2 -translate-y-1/2 line-clamp-4 break-words text-center text-xs font-bold leading-snug">{latest.body}</span>
      )}
      <span aria-hidden className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-navy-deep/60 to-transparent" />
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-navy-deep/85 to-transparent" />
      <span className={cn("absolute left-2 top-2 rounded-full p-[2.5px]", group.seen ? "bg-white/50" : "bg-sun")}>
        <span className="block rounded-full bg-card p-0.5"><AvatarMini name={group.author.username} url={group.author.avatar_url} size={32} /></span>
      </span>
      {group.stories.length > 1 && (
        <span className="absolute right-2 top-2 flex min-w-5 items-center justify-center rounded-full bg-navy-deep/70 px-1.5 text-[11px] font-bold leading-5 backdrop-blur">{group.stories.length}</span>
      )}
      <span className="absolute inset-x-2.5 bottom-2 truncate text-xs font-bold drop-shadow">{name}</span>
    </button>
  );
}

/** Kartu "Buat Story" di awal baris: foto profil di atas, tombol + oranye di perbatasan, label di bawah. Tamu diarahkan ke halaman masuk. */
export function CreateStoryCard() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const body = (
    <>
      <span className="relative block h-[68%] w-full overflow-hidden bg-header-gradient">
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" draggable={false} className="size-full object-cover" />
          : <span className="flex size-full items-center justify-center font-mono text-3xl font-bold text-primary">{profile ? profile.username.slice(0, 1).toUpperCase() : <Plus className="size-8" />}</span>}
      </span>
      <span className="absolute left-1/2 top-[68%] flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-card transition group-hover:scale-110"><Plus className="size-5" strokeWidth={3} /></span>
      <span className="flex h-[32%] items-end justify-center pb-2.5 text-xs font-bold text-foreground">Buat Story</span>
    </>
  );
  const cls = cn(STORY_CARD, "group flex flex-col bg-card");
  if (!user || !profile) return <Link to="/auth" className={cls} aria-label="Masuk untuk membuat story">{body}</Link>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cls} aria-label="Buat story">{body}</button>
      <CreateStoryDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function CreateStoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [bg, setBg] = useState<StoryBg>("senja");
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!open) { setBody(""); setImage(null); setBg("senja"); } }, [open]);

  async function pick(f: File | undefined) {
    if (!f || !user) return;
    setUploading(true);
    try { setImage(await uploadMedia(user.id, f, "stories")); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function submit() {
    if (!user) return;
    setSaving(true);
    try {
      await createStory(user.id, { body, bg, imageUrl: image });
      toast.success("Story dibagikan. Akan hilang otomatis dalam 24 jam.");
      qc.invalidateQueries({ queryKey: ["stories"] });
      onOpenChange(false);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setSaving(false); }
  }

  const left = STORY_MAX_CHARS - body.length;
  const canShare = !saving && !uploading && (!!body.trim() || !!image);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95dvh] gap-0 overflow-y-auto p-0 sm:max-w-2xl sm:overflow-hidden">
        <div className="grid sm:grid-cols-[17rem_1fr]">
          {/* Pratinjau: panel biru tua supaya kartu story menonjol, di mobile ringkas di atas form. */}
          <div className="relative flex items-center justify-center overflow-hidden bg-header-gradient px-6 py-5 sm:py-8">
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary/30 blur-3xl" />
            <div className={cn("relative flex aspect-[9/16] w-full max-w-[8.5rem] items-center justify-center overflow-hidden rounded-2xl p-4 text-center text-header-foreground shadow-xl ring-1 ring-white/20 sm:max-w-[11.5rem]", !image && STORY_BG_CLASS[bg])}>
              {image && <img src={image} alt="" className="absolute inset-0 size-full object-cover" />}
              {image && body && <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-navy-deep/90 to-transparent" />}
              <p className={cn("relative line-clamp-[9] whitespace-pre-wrap break-words font-bold", image ? "mt-auto self-end text-xs" : "text-sm sm:text-base")}>{body || (image ? "" : "Tulis sesuatu…")}</p>
              {uploading && <div className="absolute inset-0 flex items-center justify-center bg-navy-deep/60"><Loader2 className="size-6 animate-spin" /></div>}
            </div>
          </div>

          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <DialogHeader className="pr-6">
              <DialogTitle>Buat story</DialogTitle>
              <p className="text-sm text-muted-foreground">Hilang otomatis setelah 24 jam.</p>
            </DialogHeader>

            <div>
              <Textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, STORY_MAX_CHARS))} placeholder={image ? "Tambah keterangan (opsional)" : "Apa kabar hari ini?"} rows={4} autoFocus className="resize-none" />
              <p className={cn("mt-1 text-right text-xs text-muted-foreground", left < 20 && "text-destructive")} aria-live="polite">{left} huruf tersisa</p>
            </div>

            {!image && (
              <div>
                <p className="mb-2 text-sm font-semibold">Warna latar</p>
                <div className="flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label="Warna latar">
                  {STORY_BGS.map((b) => (
                    <button key={b} type="button" role="radio" aria-checked={bg === b} aria-label={BG_LABEL[b]} title={BG_LABEL[b]} onClick={() => setBg(b)}
                      className={cn("flex size-10 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-card transition", STORY_BG_CLASS[b], bg === b ? "ring-2 ring-primary" : "hover:scale-105")}>
                      {bg === b && <Check className="size-5 drop-shadow" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}><ImagePlus /> {image ? "Ganti gambar" : "Tambah gambar"}</Button>
              {image && <Button type="button" variant="ghost" size="sm" onClick={() => setImage(null)}><X /> Hapus gambar</Button>}
            </div>

            <Button type="button" size="lg" className="mt-auto w-full font-bold" disabled={!canShare} onClick={submit}>
              {saving && <Loader2 className="animate-spin" />} Bagikan story
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Penampil story layar penuh: bar kemajuan, ketuk kiri/kanan, tahan untuk jeda, panah keyboard. */
export function StoryViewer({ groups, startIndex, onClose }: { groups: StoryGroup[]; startIndex: number; onClose: () => void }) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [gi, setGi] = useState(startIndex);
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const group = groups[gi];
  const story = group?.stories[si];

  const next = useCallback(() => {
    if (!group) return;
    if (si + 1 < group.stories.length) { setSi(si + 1); return; }
    if (gi + 1 < groups.length) { setGi(gi + 1); setSi(0); return; }
    onClose();
  }, [gi, si, group, groups.length, onClose]);
  const prev = useCallback(() => {
    if (si > 0) { setSi(si - 1); return; }
    if (gi > 0) { const g = groups[gi - 1]!; setGi(gi - 1); setSi(g.stories.length - 1); }
  }, [gi, si, groups]);

  // Tandai dilihat.
  useEffect(() => {
    if (!story || !user || story.author_id === user.id) return;
    void markStoryViewed(story.id, user.id);
  }, [story, user]);

  // Waktu putar. Kemajuan disimpan di ref supaya jeda/lanjut meneruskan dari posisi terakhir.
  const progRef = useRef(0);
  const lastKey = useRef("");
  useEffect(() => {
    const key = `${gi}-${si}`;
    if (lastKey.current !== key) { lastKey.current = key; progRef.current = 0; setProgress(0); }
    if (paused || !story) return;
    const started = performance.now() - progRef.current * STORY_DURATION_MS;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - started) / STORY_DURATION_MS);
      progRef.current = p;
      setProgress(p);
      if (p >= 1) next(); else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, gi, si, story, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const mine = !!story && !!user && story.author_id === user.id;
  const views = useQuery({ queryKey: ["story-views", story?.id], queryFn: () => fetchStoryViewCount(story!.id), enabled: mine });

  async function remove() {
    if (!story || !confirm("Hapus story ini?")) return;
    try {
      await deleteStory(story.id);
      toast.success("Story dihapus");
      qc.invalidateQueries({ queryKey: ["stories"] });
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
  }

  const close = () => { qc.invalidateQueries({ queryKey: ["stories"] }); onClose(); };
  const hold = { onPointerDown: () => setPaused(true), onPointerUp: () => setPaused(false), onPointerLeave: () => setPaused(false) };
  const navBtn = "absolute top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-card text-foreground shadow-lg transition hover:bg-accent disabled:opacity-0 md:flex";

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-header/95 backdrop-blur-sm" />
        <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-0 z-50 flex items-center justify-center outline-none">
          <DialogPrimitive.Title className="sr-only">Story {group?.author.display_name || group?.author.username}</DialogPrimitive.Title>
          {group && story && (
            <div className="relative h-[100dvh] w-full sm:h-[min(92dvh,48rem)] sm:w-auto sm:aspect-[9/16]">
              <button type="button" aria-label="Story sebelumnya" onClick={prev} disabled={gi === 0 && si === 0} className={cn(navBtn, "-left-16")}><ChevronLeft className="size-6" /></button>
              <button type="button" aria-label="Story berikutnya" onClick={next} className={cn(navBtn, "-right-16")}><ChevronRight className="size-6" /></button>

              <div className={cn("relative flex size-full select-none flex-col overflow-hidden text-header-foreground sm:rounded-2xl sm:shadow-2xl", !story.image_url && STORY_BG_CLASS[(story.bg as StoryBg)] )}>
                {story.image_url && <img src={story.image_url} alt="" className="absolute inset-0 size-full bg-header object-contain" draggable={false} />}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-header/70 to-transparent" />

                {/* Bar kemajuan */}
                <div className="relative z-10 flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                  {group.stories.map((s, n) => (
                    <span key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-header-foreground/30">
                      <span className="block h-full rounded-full bg-header-foreground" style={{ width: `${n < si ? 100 : n === si ? progress * 100 : 0}%` }} />
                    </span>
                  ))}
                </div>

                {/* Kepala */}
                <div className="relative z-10 flex items-center gap-2.5 px-3 pt-3">
                  <Link to="/$username" params={{ username: group.author.username }} onClick={close} className="flex min-w-0 items-center gap-2.5">
                    <AvatarMini name={group.author.username} url={group.author.avatar_url} size={36} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{group.author.display_name || group.author.username}</span>
                      <span className="block text-xs text-header-foreground/80">{timeAgo(story.created_at)} · {storyTimeLeft(story)}</span>
                    </span>
                  </Link>
                  <span className="ml-auto flex items-center gap-1">
                    <button type="button" aria-label={paused ? "Lanjutkan" : "Jeda"} onClick={() => setPaused((p) => !p)} className="rounded-full p-2 hover:bg-header-foreground/15">{paused ? <Play className="size-5" /> : <Pause className="size-5" />}</button>
                    {(mine || isAdmin) && <button type="button" aria-label="Hapus story" onClick={remove} className="rounded-full p-2 hover:bg-header-foreground/15"><Trash2 className="size-5" /></button>}
                    <button type="button" aria-label="Tutup" onClick={close} className="rounded-full p-2 hover:bg-header-foreground/15"><X className="size-6" /></button>
                  </span>
                </div>

                {/* Area ketuk: kiri mundur, kanan maju, tahan untuk jeda */}
                <div className="absolute inset-0 top-24 z-0 flex">
                  <button type="button" aria-label="Sebelumnya" className="h-full w-1/3 cursor-w-resize" onClick={prev} {...hold} />
                  <button type="button" aria-label="Berikutnya" className="h-full w-2/3 cursor-e-resize" onClick={next} {...hold} />
                </div>

                {story.body && (
                  story.image_url ? (
                    <div className="pointer-events-none relative z-10 mt-auto bg-gradient-to-t from-header/90 to-transparent px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-16">
                      <p className="whitespace-pre-wrap break-words text-base font-semibold">{story.body}</p>
                    </div>
                  ) : (
                    <div className="pointer-events-none relative z-10 flex flex-1 items-center justify-center px-7 text-center">
                      <p className="whitespace-pre-wrap break-words text-2xl font-extrabold leading-snug">{story.body}</p>
                    </div>
                  )
                )}

                {mine && (
                  <p className="relative z-10 mt-auto flex items-center gap-1.5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm font-semibold">
                    <Eye className="size-4" /> Dilihat {views.data ?? 0} orang
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
