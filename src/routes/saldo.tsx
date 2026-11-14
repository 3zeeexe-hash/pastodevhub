import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AccountSideNav } from "@/components/side-navs";
import { ClientWalletPanel } from "@/components/client-wallet";
import { SignInCta } from "@/components/sign-in-cta";
import { GobiLoader } from "@/components/gobi-loader";

export const Route = createFileRoute("/saldo")({
  head: () => ({
    meta: [
      { title: "Saldo client — Pastodev" },
      { name: "description", content: "Saldo dari dana yang dikembalikan (lowongan atau jasa) dan penarikan ke rekening kamu." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SaldoClient,
});

function SaldoClient() {
  const { user, loading } = useAuth();
  if (loading) return <GobiLoader page />;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk melihat saldo kamu." /></main>;
  return (
    <AccountSideNav>
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-bold">Saldo &amp; penarikan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dana yang dikembalikan ke kamu dari lowongan atau jasa (refund admin, sengketa yang kamu menangkan, atau kontrak yang ditutup) masuk ke sini. Kamu bisa menariknya ke rekening kapan saja.
          </p>
        </header>
        <ClientWalletPanel
          fallback={<p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Fitur saldo client belum aktif. Admin perlu menjalankan SQL saldo client (gobi-work/011) terlebih dahulu.</p>}
        />
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Hasil kerja sebagai developer atau freelancer ada di <Link to="/studio/saldo" className="text-primary underline">Studio &rsaquo; Saldo &amp; penarikan</Link>. Riwayat pembayaran proyek ada di <Link to="/kerja/pembayaran" className="text-primary underline">GOBI WORK &rsaquo; Pembayaran</Link>.
        </p>
      </div>
    </AccountSideNav>
  );
}
