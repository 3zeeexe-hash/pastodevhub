import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="batik-line" />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-muted-foreground">
        <BrandMark size={24} />
        <span>© {new Date().getFullYear()} Pastodev — rumah kode developer Nusantara</span>
        <nav className="ml-auto flex gap-4">
          <Link to="/explore" className="hover:text-primary">Jelajahi</Link>
          <Link to="/discuss" className="hover:text-primary">Diskusi</Link>
          <Link to="/import" className="hover:text-primary">Impor GitHub</Link>
        </nav>
      </div>
    </footer>
  );
}
