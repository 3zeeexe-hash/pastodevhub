import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/** Tanggal terakhir kebijakan/ketentuan diperbarui. Ubah setiap kali isi halaman hukum berubah. */
export const LEGAL_UPDATED = "15 November 2026";
/** Email kontak yang tampil di halaman Privasi & Syarat. GANTI dengan email yang benar-benar kamu pantau. */
export const LEGAL_CONTACT_EMAIL = "kontak@pstodev.my.id";
export const LEGAL_SITE = "https://pstodev.my.id";

export type LegalSection = { id: string; title: string; body: ReactNode };

export function P({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed text-muted-foreground">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-muted-foreground">{children}</ul>;
}

/** Kerangka halaman hukum: judul, daftar isi, bagian bernomor, dan tautan ke halaman pasangannya. */
export function LegalPage({
  title,
  intro,
  sections,
  other,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  other: { href: string; label: string };
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <nav aria-label="Jejak halaman" className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-primary">Beranda</Link> <span aria-hidden="true">/</span> <span>{title}</span>
      </nav>

      <header className="border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Terakhir diperbarui: {LEGAL_UPDATED}</p>
        <div className="mt-4 space-y-3">{intro}</div>
      </header>

      <nav aria-label="Daftar isi" className="my-8 rounded-xl border border-border bg-card p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Daftar isi</p>
        <ol className="grid list-decimal gap-x-8 gap-y-1.5 pl-5 text-sm sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s.id}><a href={`#${s.id}`} className="text-link hover:underline">{s.title}</a></li>
          ))}
        </ol>
      </nav>

      <div className="space-y-10">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">{i + 1}. {s.title}</h2>
            {s.body}
          </section>
        ))}
      </div>

      <footer className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>Pertanyaan? Hubungi <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-link hover:underline">{LEGAL_CONTACT_EMAIL}</a></span>
        <a href={other.href} className="font-medium text-link hover:underline">{other.label} →</a>
      </footer>
    </main>
  );
}
