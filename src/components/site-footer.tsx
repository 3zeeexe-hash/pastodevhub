import { Link } from "@tanstack/react-router";
import { Code2, Github, MessageSquare, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isFeatureOn } from "@/lib/features";
import { useSiteConfig } from "@/lib/use-site-config";
import { BrandMark } from "@/components/brand";

const link = "text-sm text-white/70 transition hover:text-primary";
const heading = "mb-3 text-xs font-semibold uppercase tracking-wider text-white/50";

/** Footer biru tua GOBI: merek + ajakan bergabung, tiga kolom tautan, dan baris hak cipta. Tautan fitur mengikuti saklar fitur situs. */
export function SiteFooter() {
  const { user } = useAuth();
  const { flags } = useSiteConfig();
  const on = (key: Parameters<typeof isFeatureOn>[1]) => isFeatureOn(flags, key);
  return (
    <footer className="mt-16 bg-gradient-to-b from-navy to-navy-deep text-white">
      <div className="batik-line" />
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 xl:max-w-7xl">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <Link to="/" className="flex items-center gap-2.5">
              <BrandMark size={40} />
              <span className="text-xl font-bold tracking-tight">Go<span className="text-primary">Bi</span></span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Rumah kode developer Nusantara: pamerkan repositori, tawarkan jasa, jual karya, dan temukan lowongan dalam satu komunitas.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {on("github") && (
                <Link to="/import" className="inline-flex items-center gap-2 rounded-full bg-sun px-4 py-2 text-sm font-semibold text-navy shadow-glow transition hover:brightness-105">
                  <Github className="size-4" /> Impor dari GitHub
                </Link>
              )}
              {!user && (
                <Link to="/auth" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
                  <Sparkles className="size-4" /> Gabung gratis
                </Link>
              )}
            </div>
          </div>

          <nav aria-label="Jelajahi">
            <p className={heading}>Jelajahi</p>
            <ul className="flex flex-col gap-2.5">
              <li><Link to="/explore" className={link}>Proyek</Link></li>
              <li><Link to="/search" search={{ q: "", type: "users" }} className={link}>Talenta</Link></li>
              {on("jobs") && <li><Link to="/lowongan" className={link}>Lowongan</Link></li>}
              {on("jasa") && <li><Link to="/jasa" className={link}>Jasa</Link></li>}
              {on("karya") && <li><Link to="/katalog" className={link}>Katalog karya</Link></li>}
            </ul>
          </nav>

          <nav aria-label="Komunitas">
            <p className={heading}>Komunitas</p>
            <ul className="flex flex-col gap-2.5">
              {on("discuss") && <li><Link to="/discuss" className={link}>Diskusi</Link></li>}
              {on("github") && <li><Link to="/import" className={link}>Impor GitHub</Link></li>}
              {user && on("repos") && <li><Link to="/new" className={link}>Repositori baru</Link></li>}
            </ul>
          </nav>

          <nav aria-label="Akun">
            <p className={heading}>Akun</p>
            <ul className="flex flex-col gap-2.5">
              {user ? (
                <>
                  <li><Link to="/pesanan" className={link}>Pesanan</Link></li>
                  <li><Link to="/verifikasi" className={link}>Verifikasi akun</Link></li>
                  <li><Link to="/settings" className={link}>Pengaturan</Link></li>
                </>
              ) : (
                <li><Link to="/auth" className={link}>Masuk / Daftar</Link></li>
              )}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/60 sm:flex-row">
          <span>© {new Date().getFullYear()} GOBI — rumah kode developer Nusantara</span>
          <span className="inline-flex items-center gap-1.5"><Code2 className="size-3.5 text-primary" /> Dibuat untuk developer Indonesia</span>
        </div>
      </div>
    </footer>
  );
}
