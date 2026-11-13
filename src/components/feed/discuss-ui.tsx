import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, Code, Megaphone, Send, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AvatarMini } from "@/components/avatar-mini";
import { BrandMark } from "@/components/brand";
import { SignInCta } from "@/components/sign-in-cta";
import { Composer } from "@/components/feed/composer";
import { CreateStoryTile, StoryBubble, StoryViewer, useStoryGroups } from "@/components/feed/stories";
import type { StoryGroup } from "@/lib/stories";
import type { HomeData } from "@/components/home/use-home-data";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Dialog tulis post. Dipakai oleh kotak tulis dan tombol "Buat Post" di baris cerita. */
function ComposeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Tulis post</DialogTitle></DialogHeader>
        <Composer kind="post" autoFocus onPosted={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Kotak tulis ringkas di atas linimasa. Mengetuknya membuka Composer lengkap (polling, kode, hitungan huruf). */
export function ComposerBar() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user || !profile) return <SignInCta text="Masuk untuk ikut berdiskusi." />;
  return (
    <div id="tulis" className="scroll-mt-32 rounded-2xl border border-border bg-card/80 p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <AvatarMini name={profile.username} url={profile.avatar_url} size={44} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 min-w-0 flex-1 items-center rounded-full bg-background/60 px-4 text-left text-sm text-muted-foreground ring-1 ring-border transition hover:ring-primary/50"
        >
          <span className="truncate">Apa yang sedang kamu pikirkan?</span>
        </button>
        <button
          type="button"
          aria-label="Tulis post"
          onClick={() => setOpen(true)}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow transition hover:brightness-110"
        >
          <Send className="size-5" />
        </button>
      </div>
      <ComposeDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

/**
 * Baris story di atas linimasa: tile "Buat Story", lalu story aktif (hilang setelah 24 jam), lalu talenta
 * (cincin oranye = siap menerima proyek) supaya baris tidak kosong saat belum ada story.
 */
export function StoryRow({ data }: { data: HomeData }) {
  const scroller = useRef<HTMLUListElement>(null);
  const stories = useStoryGroups();
  const [viewing, setViewing] = useState<{ groups: StoryGroup[]; index: number } | null>(null);
  const groups = stories.data ?? [];
  const withStory = new Set(groups.map((g) => g.author.username));
  const devs = (data.devs.data ?? []).filter((d) => !withStory.has(d.username));

  return (
    <section aria-label="Story" className="relative">
      <ul ref={scroller} className="flex gap-4 overflow-x-auto px-4 py-3 pr-16 [scrollbar-width:none]">
        <li className="shrink-0"><CreateStoryTile /></li>
        {groups.map((g, n) => (
          <li key={g.authorId} className="shrink-0"><StoryBubble group={g} onOpen={() => setViewing({ groups, index: n })} /></li>
        ))}
        {devs.map((d) => (
          <li key={d.username} className="shrink-0">
            <Link to="/$username" params={{ username: d.username }} className="flex w-16 flex-col items-center gap-1.5">
              <span className={cn("rounded-full p-[3px]", d.available_for_hire ? "bg-sun opacity-70" : "bg-border")}>
                <span className="block rounded-full bg-background p-0.5"><AvatarMini name={d.username} url={d.avatar_url} size={56} /></span>
              </span>
              <span className="w-full truncate text-center text-xs text-muted-foreground">{d.display_name || d.username}</span>
            </Link>
          </li>
        ))}
      </ul>
      {groups.length + devs.length > 3 && (
        <button
          type="button"
          aria-label="Geser ke kanan"
          onClick={() => scroller.current?.scrollBy({ left: 240, behavior: "smooth" })}
          className="absolute right-3 top-8 hidden size-9 items-center justify-center rounded-full bg-card text-foreground shadow ring-1 ring-border transition hover:bg-accent sm:flex"
        >
          <ChevronRight className="size-5" />
        </button>
      )}
      {viewing && <StoryViewer groups={viewing.groups} startIndex={viewing.index} onClose={() => setViewing(null)} />}
    </section>
  );
}

const WELCOME_KEY = "pastodev-discuss-welcome-dismissed";

/** Banner sambutan. Bisa ditutup, dan pilihan itu diingat di browser. */
export function WelcomeBanner() {
  // Mulai tersembunyi sampai penyimpanan browser terbaca, supaya tidak berkedip atau beda dengan hasil render server.
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(window.localStorage.getItem(WELCOME_KEY) === "1"); } catch { setHidden(false); }
  }, []);
  if (hidden) return null;

  const close = () => {
    setHidden(true);
    try { window.localStorage.setItem(WELCOME_KEY, "1"); } catch { /* penyimpanan browser tidak tersedia; banner kembali di muatan berikutnya */ }
  };

  return (
    <section aria-label="Selamat datang" className="px-3 pb-3 sm:px-4">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#081638] via-[#0a1d4d] to-[#0f2f7a] p-5 text-white shadow-lg sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -bottom-12 -right-10 h-44 w-64 -rotate-[18deg] rounded-[2rem] bg-gradient-to-tr from-[#ff7a00] to-[#ffb340] opacity-90 sm:h-56 sm:w-80" />
        <div aria-hidden className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-[#1a56e8]/30 blur-3xl" />
        <button type="button" aria-label="Tutup banner" onClick={close} className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white">
          <X className="size-5" />
        </button>
        <span aria-hidden className="absolute right-4 top-12 flex size-11 items-center justify-center rounded-xl bg-[#1a73e8]/40 text-sky-200 ring-1 ring-white/10 sm:right-8">
          <Code className="size-6" />
        </span>
        <div className="relative">
          <div className="pr-28 sm:pr-52">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Megaphone className="size-4" /></span>
              Selamat Datang di GOBI!
            </p>
            <h2 className="mt-3 text-xl font-extrabold leading-tight sm:text-2xl">
              Bergabung, Berbagi, dan Tumbuh Bersama Komunitas Developer <span className="text-[#ff9f1a]">Indonesia</span>
            </h2>
            <Link to="/explore" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#0a1a45] transition hover:bg-white/90">
              Jelajahi Sekarang <ArrowRight className="size-4" />
            </Link>
          </div>
          <div aria-hidden className="pointer-events-none absolute -bottom-2 right-0 sm:right-6">
            <BrandMark size={96} />
          </div>
        </div>
      </div>
    </section>
  );
}
