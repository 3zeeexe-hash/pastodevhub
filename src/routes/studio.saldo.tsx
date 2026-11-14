import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpRight, CheckCircle2, Hourglass, Info, Landmark, Loader2, Plus, Receipt, Send, ShieldCheck, Snowflake, Star, Trash2, Wallet, type LucideIcon } from "lucide-react";
import { useAuth, timeAgo } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { errMsg, formatRupiah } from "@/lib/market";
import { BANK_PRESETS, MAX_PAYOUT_ACCOUNTS, maskNumber, usePayoutAccounts } from "@/lib/payout-accounts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RupiahInput } from "@/components/rupiah-input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/studio/saldo")({
  head: () => ({ meta: [{ title: "Saldo & penarikan — Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: SaldoPage,
});

const MIN_PAYOUT = 10000;

/** Saldo berbasis escrow (docs/sql/midtrans-escrow/001). */
type WalletRow = { on_hold: number; awaiting_admin: number; available: number; frozen: number; requested: number; paid_out: number };
/** Saldo lama, hanya dipakai selama SQL escrow belum dijalankan. */
type LegacyBalance = { earned: number; on_hold: number; paid_out: number; pending: number; available: number };
type PayoutRow = { id: string; amount: number; bank_name: string; account_number: string; account_name: string; status: string; admin_note: string | null; created_at: string };
type OrderRow = { id: string; title: string; amount: number; status: string; kind: string | null; paid_at: string | null; created_at: string };
type EscRow = { order_id: string; fee: number; net: number; status: string };

const num = (v: unknown) => Number(v ?? 0) || 0;
const rupiah = (v: number | undefined) => formatRupiah(v ?? 0, "Rp0");

const PAYOUT_LABEL: Record<string, string> = { requested: "Diproses", paid: "Sudah ditransfer", rejected: "Ditolak" };
const PAYOUT_TONE: Record<string, string> = {
  requested: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-destructive/10 text-destructive",
};
const ESC_LABEL: Record<string, string> = { held: "Ditahan escrow", frozen: "Dibekukan (sengketa)", released: "Dana diteruskan", refunded: "Dikembalikan" };

type Item = { key: string; label: string; v: number; Icon: LucideIcon; bar: string; hint: string };

const card = "rounded-2xl border border-border bg-card";

function SaldoPage() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const [tab, setTab] = useState("ringkasan");
  const accounts = usePayoutAccounts(uid);

  const { data, isLoading, error } = useQuery({
    queryKey: ["studio-saldo", uid],
    enabled: !!uid,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [walletRes, payoutsRes, ordersRes] = await Promise.all([
        looseDb.rpc("developer_wallet", { _user_id: uid! }),
        looseDb.from("payouts").select("*").eq("developer_id", uid!).order("created_at", { ascending: false }).limit(100),
        looseDb.from("orders").select("id,title,amount,status,kind,paid_at,created_at").eq("seller_id", uid!).not("paid_at", "is", null).order("paid_at", { ascending: false }).limit(50),
      ]);
      let wallet: WalletRow | null = null;
      let legacy: LegacyBalance | null = null;
      if (!walletRes.error) {
        const r = (walletRes.data as Record<string, unknown>[] | null)?.[0] ?? {};
        wallet = { on_hold: num(r["on_hold"]), awaiting_admin: num(r["awaiting_admin"]), available: num(r["available"]), frozen: num(r["frozen"]), requested: num(r["requested"]), paid_out: num(r["paid_out"]) };
      } else {
        // SQL escrow belum dijalankan: pakai saldo lama supaya halaman tetap berfungsi.
        const bal = await looseDb.rpc("developer_balance", { _user_id: uid! });
        legacy = ((bal.data as LegacyBalance[] | null)?.[0]) ?? null;
      }
      const orders = (ordersRes.data ?? []) as OrderRow[];
      const esc: Record<string, EscRow> = {};
      if (orders.length) {
        const e = await looseDb.from("escrow_ledger").select("order_id,fee,net,status").in("order_id", orders.map((o) => o.id));
        if (!e.error) for (const r of (e.data ?? []) as EscRow[]) esc[r.order_id] = r;
      }
      return { wallet, legacy, payouts: (payoutsRes.data ?? []) as PayoutRow[], orders, esc };
    },
  });

  const wallet = data?.wallet ?? null;
  const legacy = data?.legacy ?? null;
  const available = wallet ? wallet.available : num(legacy?.available);

  const items: Item[] = wallet
    ? [
        { key: "available", label: "Tersedia", v: wallet.available, Icon: Wallet, bar: "bg-primary", hint: "Siap kamu cairkan sekarang." },
        { key: "on_hold", label: "Ditahan", v: wallet.on_hold, Icon: Hourglass, bar: "bg-amber-400", hint: "Masa tahan 1 hari untuk karya, atau pekerjaan jasa masih berjalan." },
        { key: "awaiting", label: "Menunggu konfirmasi admin", v: wallet.awaiting_admin, Icon: ShieldCheck, bar: "bg-sky-500", hint: "Hasil jasa sudah diterima client. Admin meneruskan dananya secara manual." },
        { key: "requested", label: "Sedang dicairkan", v: wallet.requested, Icon: Send, bar: "bg-violet-500", hint: "Pengajuan pencairan menunggu transfer admin." },
        { key: "paid", label: "Sudah dicairkan", v: wallet.paid_out, Icon: CheckCircle2, bar: "bg-emerald-500", hint: "Total yang sudah ditransfer ke rekeningmu." },
        ...(wallet.frozen > 0 ? [{ key: "frozen", label: "Dibekukan admin", v: wallet.frozen, Icon: Snowflake, bar: "bg-slate-400", hint: "Dana dibekukan admin, misalnya karena ada sengketa." }] : []),
      ]
    : legacy
      ? [
          { key: "available", label: "Tersedia", v: num(legacy.available), Icon: Wallet, bar: "bg-primary", hint: "Siap kamu cairkan sekarang." },
          { key: "on_hold", label: "Ditahan (pesanan berjalan)", v: num(legacy.on_hold), Icon: Hourglass, bar: "bg-amber-400", hint: "Dana dari pesanan yang masih berjalan." },
          { key: "requested", label: "Sedang dicairkan", v: num(legacy.pending), Icon: Send, bar: "bg-violet-500", hint: "Pengajuan pencairan menunggu transfer admin." },
          { key: "paid", label: "Sudah dicairkan", v: num(legacy.paid_out), Icon: CheckCircle2, bar: "bg-emerald-500", hint: "Total yang sudah ditransfer ke rekeningmu." },
        ]
      : [];
  const total = items.reduce((s, i) => s + i.v, 0);
  const canWithdraw = available >= (wallet ? MIN_PAYOUT : 1);
  const defaultAccount = accounts.accounts.find((a) => a.is_default) ?? accounts.accounts[0];

  function sent() {
    qc.invalidateQueries({ queryKey: ["studio-saldo"] });
    qc.invalidateQueries({ queryKey: ["studio-home"] });
    setTab("riwayat");
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Saldo &amp; penarikan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pantau penghasilan, tarik saldo ke rekeningmu, dan atur rekening pencairan.</p>
      </header>

      {isLoading ? (
        <Skeleton className="h-48 rounded-3xl" />
      ) : error ? (
        <p role="alert" className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4 text-sm">{errMsg(error)}</p>
      ) : (
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-navy-deep p-5 text-white shadow-lg ring-1 ring-white/10 sm:p-6">
          <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full bg-primary/30 blur-3xl" />
          <p className="relative flex items-center gap-2 text-sm text-white/70"><Wallet className="size-4" /> Saldo tersedia</p>
          <p className="relative mt-1 text-4xl font-bold tracking-tight">{rupiah(available)}</p>
          <p className="relative mt-1 text-sm text-white/60">Total pendapatan {rupiah(total)}</p>
          {total > 0 && (
            <div className="relative mt-4 flex h-2 overflow-hidden rounded-full bg-white/15" role="img" aria-label="Komposisi saldo">
              {items.filter((i) => i.v > 0).map((i) => (
                <span key={i.key} title={`${i.label}: ${rupiah(i.v)}`} className={cn("h-full", i.bar)} style={{ width: `${(i.v / total) * 100}%` }} />
              ))}
            </div>
          )}
          <div className="relative mt-5 flex flex-wrap gap-2">
            <Button onClick={() => setTab("tarik")} disabled={!canWithdraw}><ArrowUpRight /> Tarik saldo</Button>
            <Button asChild variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Link to="/pesanan"><Receipt /> Lihat pesanan</Link></Button>
          </div>
          {!canWithdraw && <p className="relative mt-3 text-xs text-white/60">{wallet ? `Saldo tersedia belum mencapai minimal pencairan ${formatRupiah(MIN_PAYOUT)}.` : "Belum ada saldo yang bisa dicairkan."}</p>}
        </section>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-full bg-muted p-1">
          <TabsTrigger value="ringkasan" className="shrink-0 rounded-full px-4">Ringkasan</TabsTrigger>
          <TabsTrigger value="tarik" className="shrink-0 rounded-full px-4">Tarik saldo</TabsTrigger>
          <TabsTrigger value="pendapatan" className="shrink-0 rounded-full px-4">Pendapatan</TabsTrigger>
          <TabsTrigger value="riwayat" className="shrink-0 rounded-full px-4">Riwayat tarik</TabsTrigger>
          <TabsTrigger value="rekening" className="shrink-0 rounded-full px-4">Rekening</TabsTrigger>
        </TabsList>

        <TabsContent value="ringkasan" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((i) => (
              <div key={i.key} className={cn(card, "flex gap-3 p-4")}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><i.Icon className="size-5" /></span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{i.label}</p>
                  <p className={cn("text-xl font-bold", i.key === "available" && "text-primary")}>{rupiah(i.v)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{i.hint}</p>
                </div>
              </div>
            ))}
          </div>
          <div className={cn(card, "p-4")}>
            <h2 className="flex items-center gap-2 text-base font-bold"><Landmark className="size-4 text-primary" /> Rekening utama</h2>
            {defaultAccount ? (
              <p className="mt-2 text-sm">{defaultAccount.bank_name} {maskNumber(defaultAccount.account_number)} <span className="text-muted-foreground">a.n. {defaultAccount.account_name}</span></p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Belum ada rekening tersimpan.</p>
            )}
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setTab("rekening")}>{defaultAccount ? "Kelola rekening" : "Tambah rekening"}</Button>
          </div>
          <div className={cn(card, "p-4")}>
            <h2 className="flex items-center gap-2 text-base font-bold"><Info className="size-4 text-primary" /> Cara kerja saldo</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>Semua pembayaran ditahan admin 1 hari. Saldo karya otomatis tersedia setelah itu.</li>
              <li>Saldo jasa baru tersedia setelah hasil diterima client dan admin meneruskannya secara manual.</li>
              {wallet && <li>Pencairan minimal {formatRupiah(MIN_PAYOUT)}.</li>}
              <li>Pengajuan pencairan diproses admin secara manual. Statusnya bisa dipantau di tab Riwayat tarik.</li>
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="tarik" className="mt-4">
          {uid && <WithdrawForm available={available} walletMode={!!wallet} accounts={accounts} onSent={sent} goAccounts={() => setTab("rekening")} />}
        </TabsContent>

        <TabsContent value="pendapatan" className="mt-4">
          <ul className="space-y-2">
            {(data?.orders ?? []).map((o) => {
              const e = data?.esc[o.id];
              return (
                <li key={o.id}>
                  <Link to="/pesanan/$id" params={{ id: o.id }} className={cn(card, "block p-4 transition hover:border-primary/50")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-semibold">{o.title}</p>
                      <p className="font-bold">{rupiah(e ? e.net : o.amount)}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {o.kind === "service" ? "Jasa" : o.kind === "product" ? "Karya" : "Pesanan"} · dibayar {o.paid_at ? timeAgo(o.paid_at) : "—"}
                      {e ? ` · ${ESC_LABEL[e.status] ?? e.status} · harga ${rupiah(o.amount)} · komisi ${rupiah(e.fee)}` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
            {!isLoading && (data?.orders.length ?? 0) === 0 && <li className={cn(card, "p-4 text-sm text-muted-foreground")}>Belum ada pesanan yang dibayar.</li>}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Menampilkan 50 pesanan berbayar terbaru. Jumlah di kanan adalah bagian yang kamu terima setelah komisi platform, bila datanya tersedia.</p>
        </TabsContent>

        <TabsContent value="riwayat" className="mt-4">
          <PayoutHistory rows={data?.payouts ?? []} loading={isLoading} />
        </TabsContent>

        <TabsContent value="rekening" className="mt-4">
          <AccountsPanel accounts={accounts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type AccountsApi = ReturnType<typeof usePayoutAccounts>;

function WithdrawForm({ available, walletMode, accounts, onSent, goAccounts }: { available: number; walletMode: boolean; accounts: AccountsApi; onSent: () => void; goAccounts: () => void }) {
  const list = accounts.accounts;
  const [choice, setChoice] = useState<string | null>(null); // null = rekening utama, "new" = isi manual
  const [amount, setAmount] = useState("");
  const [nf, setNf] = useState({ bank: "", number: "", name: "", save: true });
  const [busy, setBusy] = useState(false);

  const manual = choice === "new" || list.length === 0;
  const selected = manual ? null : (list.find((a) => a.id === choice) ?? list.find((a) => a.is_default) ?? list[0] ?? null);
  const target = manual
    ? { bank: nf.bank.trim(), number: nf.number.replace(/\s/g, ""), name: nf.name.trim() }
    : selected ? { bank: selected.bank_name, number: selected.account_number, name: selected.account_name } : null;
  const value = Number(amount) || 0;
  const min = walletMode ? MIN_PAYOUT : 1;
  const problem = !value ? null : value > available ? "Jumlah melebihi saldo tersedia." : value < min ? `Pencairan minimal ${formatRupiah(MIN_PAYOUT)}.` : null;
  const targetOk = !!target && target.bank.length >= 2 && /^\d{5,25}$/.test(target.number) && target.name.length >= 2;
  const canSend = value > 0 && !problem && targetOk && !busy;
  const locked = available < min;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || !target) return;
    setBusy(true);
    const args = { _amount: value, _bank_name: target.bank, _account_number: target.number, _account_name: target.name };
    const { error } = walletMode ? await looseDb.rpc("request_wallet_payout", args) : await looseDb.rpc("request_payout", args);
    if (error) { setBusy(false); toast.error(errMsg(error)); return; }
    if (manual && nf.save) await accounts.add({ bank_name: target.bank, account_number: target.number, account_name: target.name });
    setBusy(false);
    toast.success("Pengajuan pencairan dikirim ke admin");
    setAmount("");
    setNf({ bank: "", number: "", name: "", save: true });
    setChoice(null);
    onSent();
  }

  const quick = [["25%", 0.25], ["50%", 0.5], ["Semua", 1]] as const;

  return (
    <form onSubmit={submit} className={cn(card, "space-y-5 p-4 sm:p-5")}>
      {locked && (
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          {walletMode ? `Saldo tersedia belum mencapai minimal pencairan ${formatRupiah(MIN_PAYOUT)}.` : "Belum ada saldo yang bisa dicairkan."} Saldo yang masih ditahan akan tersedia sesuai aturan di tab Ringkasan.
        </p>
      )}
      <fieldset disabled={locked} className="space-y-5 disabled:opacity-60">
        <div>
          <Label htmlFor="w-amount">Jumlah</Label>
          <RupiahInput id="w-amount" value={amount} placeholder={`Tersedia ${rupiah(available)}`} onValueChange={setAmount} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quick.map(([label, pct]) => (
              <button key={label} type="button" onClick={() => setAmount(String(Math.floor(available * pct)))} className="rounded-full border border-border px-3 py-1 text-xs transition hover:bg-accent">{label}</button>
            ))}
          </div>
          {problem && <p role="alert" className="mt-2 text-xs text-destructive">{problem}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Rekening tujuan</p>
            {list.length > 0 && <button type="button" onClick={goAccounts} className="text-xs text-link hover:underline">Kelola rekening</button>}
          </div>
          {list.length > 0 && (
            <div role="radiogroup" aria-label="Rekening tujuan" className="mt-2 grid gap-2">
              {list.map((a) => {
                const on = !manual && selected?.id === a.id;
                return (
                  <button key={a.id} type="button" role="radio" aria-checked={on} onClick={() => setChoice(a.id)}
                    className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition", on ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40")}>
                    <Landmark className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.bank_name} {maskNumber(a.account_number)}</span>
                      <span className="block truncate text-xs text-muted-foreground">a.n. {a.account_name}</span>
                    </span>
                    {a.is_default && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Utama</span>}
                  </button>
                );
              })}
              <button type="button" role="radio" aria-checked={manual} onClick={() => setChoice("new")}
                className={cn("flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-left text-sm transition", manual ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40")}>
                <Plus className="size-4 shrink-0 text-muted-foreground" /> Pakai rekening lain
              </button>
            </div>
          )}
          {manual && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="w-bank">Bank / e-wallet</Label>
                <Input id="w-bank" value={nf.bank} maxLength={60} placeholder="BCA, Mandiri, DANA…" onChange={(e) => setNf({ ...nf, bank: e.target.value })} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {BANK_PRESETS.map((b) => (
                    <button key={b} type="button" onClick={() => setNf({ ...nf, bank: b })} className={cn("rounded-full border px-2.5 py-1 text-xs transition", nf.bank === b ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent")}>{b}</button>
                  ))}
                </div>
              </div>
              <div><Label htmlFor="w-num">Nomor rekening</Label><Input id="w-num" inputMode="numeric" value={nf.number} maxLength={30} onChange={(e) => setNf({ ...nf, number: e.target.value.replace(/[^\d\s]/g, "") })} /></div>
              <div><Label htmlFor="w-name">Atas nama</Label><Input id="w-name" value={nf.name} maxLength={100} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></div>
              {list.length < MAX_PAYOUT_ACCOUNTS && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" className="size-4 accent-primary" checked={nf.save} onChange={(e) => setNf({ ...nf, save: e.target.checked })} /> Simpan rekening ini untuk pencairan berikutnya
                </label>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-muted p-3 text-sm">
          {value > 0 && targetOk && target ? (
            <p>Kamu akan mencairkan <b>{formatRupiah(value)}</b> ke <b>{target.bank} {maskNumber(target.number)}</b> a.n. {target.name}. Admin memproses pengajuan secara manual.</p>
          ) : (
            <p className="text-muted-foreground">Isi jumlah dan rekening tujuan. Rangkuman pengajuan muncul di sini.</p>
          )}
        </div>

        <Button type="submit" disabled={!canSend}>{busy ? <Loader2 className="animate-spin" /> : <ArrowUpRight />} Ajukan pencairan</Button>
      </fieldset>
    </form>
  );
}

function PayoutHistory({ rows, loading }: { rows: PayoutRow[]; loading: boolean }) {
  const [filter, setFilter] = useState<string>("all");
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const filters: [string, string][] = [["all", "Semua"], ["requested", "Diproses"], ["paid", "Ditransfer"], ["rejected", "Ditolak"]];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {filters.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={cn("rounded-full border px-3 py-1 text-xs transition", filter === k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent")}>{label}</button>
        ))}
      </div>
      <ul className="space-y-2">
        {shown.map((p) => (
          <li key={p.id} className={cn(card, "p-4")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-lg font-bold">{formatRupiah(p.amount)}</p>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PAYOUT_TONE[p.status] ?? "bg-muted text-muted-foreground")}>{PAYOUT_LABEL[p.status] ?? p.status}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{p.bank_name} {maskNumber(p.account_number)} · a.n. {p.account_name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Diajukan {timeAgo(p.created_at)}</p>
            {p.admin_note && <p className="mt-2 rounded-lg bg-muted p-2 text-xs">Catatan admin: {p.admin_note}</p>}
          </li>
        ))}
        {!loading && shown.length === 0 && <li className={cn(card, "p-4 text-sm text-muted-foreground")}>{rows.length === 0 ? "Belum ada pengajuan pencairan." : "Tidak ada pengajuan dengan status ini."}</li>}
      </ul>
    </div>
  );
}

function AccountsPanel({ accounts }: { accounts: AccountsApi }) {
  const [f, setF] = useState({ bank: "", number: "", name: "", main: false });
  const [busy, setBusy] = useState(false);
  const full = accounts.accounts.length >= MAX_PAYOUT_ACCOUNTS;

  async function run(fn: () => Promise<string | null>, ok: string) {
    setBusy(true);
    const msg = await fn();
    setBusy(false);
    if (msg) toast.error(msg); else toast.success(ok);
    return !msg;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const done = await run(() => accounts.add({ bank_name: f.bank, account_number: f.number.replace(/\s/g, ""), account_name: f.name, is_default: f.main }), "Rekening disimpan");
    if (done) setF({ bank: "", number: "", name: "", main: false });
  }

  return (
    <div className="space-y-4">
      {accounts.local && (
        <p className="flex gap-2 rounded-2xl border border-border bg-muted p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" /> Rekening disimpan di perangkat ini saja. Setelah admin menerapkan SQL rekening pencairan, daftar ikut ke semua perangkat.
        </p>
      )}
      <ul className="space-y-2">
        {accounts.accounts.map((a) => (
          <li key={a.id} className={cn(card, "flex flex-wrap items-center gap-3 p-3")}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Landmark className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{a.bank_name} {maskNumber(a.account_number)} {a.is_default && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Utama</span>}</p>
              <p className="truncate text-xs text-muted-foreground">a.n. {a.account_name}</p>
            </div>
            {!a.is_default && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => accounts.makeDefault(a.id), "Rekening utama diubah")}><Star /> Jadikan utama</Button>}
            <Button size="icon" variant="ghost" className="text-destructive" disabled={busy} aria-label={`Hapus rekening ${a.bank_name}`} onClick={() => { if (confirm(`Hapus rekening ${a.bank_name} ${maskNumber(a.account_number)}?`)) void run(() => accounts.remove(a.id), "Rekening dihapus"); }}><Trash2 /></Button>
          </li>
        ))}
        {!accounts.isLoading && accounts.accounts.length === 0 && <li className={cn(card, "p-4 text-sm text-muted-foreground")}>Belum ada rekening tersimpan.</li>}
      </ul>

      <form onSubmit={add} className={cn(card, "grid gap-3 p-4 sm:grid-cols-2")}>
        <h2 className="flex items-center gap-2 text-base font-bold sm:col-span-2"><Plus className="size-4 text-primary" /> Tambah rekening</h2>
        {full ? (
          <p className="text-sm text-muted-foreground sm:col-span-2">Sudah mencapai batas {MAX_PAYOUT_ACCOUNTS} rekening. Hapus salah satu untuk menambah yang baru.</p>
        ) : (
          <>
            <div className="sm:col-span-2">
              <Label htmlFor="a-bank">Bank / e-wallet</Label>
              <Input id="a-bank" value={f.bank} maxLength={60} placeholder="BCA, Mandiri, DANA…" onChange={(e) => setF({ ...f, bank: e.target.value })} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BANK_PRESETS.map((b) => (
                  <button key={b} type="button" onClick={() => setF({ ...f, bank: b })} className={cn("rounded-full border px-2.5 py-1 text-xs transition", f.bank === b ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent")}>{b}</button>
                ))}
              </div>
            </div>
            <div><Label htmlFor="a-num">Nomor rekening</Label><Input id="a-num" inputMode="numeric" value={f.number} maxLength={30} onChange={(e) => setF({ ...f, number: e.target.value.replace(/[^\d\s]/g, "") })} /></div>
            <div><Label htmlFor="a-name">Atas nama</Label><Input id="a-name" value={f.name} maxLength={100} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-4 accent-primary" checked={f.main} onChange={(e) => setF({ ...f, main: e.target.checked })} /> Jadikan rekening utama
            </label>
            <Button type="submit" className="sm:w-fit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Simpan rekening</Button>
          </>
        )}
      </form>
      <p className="text-xs text-muted-foreground">Pastikan nama pemilik rekening sama dengan nama kamu. Nomor rekening disamarkan di layar; admin melihat data lengkap saat memproses pencairan.</p>
    </div>
  );
}
