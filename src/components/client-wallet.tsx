// GOBI WORK — saldo client: dana yang dikembalikan (sengketa dimenangkan client, refund admin, kontrak ditutup) masuk ke sini dan bisa ditarik.
// Membutuhkan docs/sql/gobi-work/011_saldo_client_sengketa_otomatis.sql; sebelum diterapkan, panel ini tidak ditampilkan.
import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Landmark, Loader2, Plus, Wallet } from "lucide-react";
import { useAuth, timeAgo } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { errMsg, formatRupiah } from "@/lib/market";
import { BANK_PRESETS, maskNumber, usePayoutAccounts } from "@/lib/payout-accounts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RupiahInput } from "@/components/rupiah-input";
import { ErrorState, Pill } from "@/components/work-ui";

const MIN_WITHDRAW = 10000;
const MISSING = /could not find|does not exist|schema cache/i;

type Wallet = { available: number; requested: number; paid_out: number; total_in: number };
type Entry = { id: string; amount: number; kind: string; note: string | null; created_at: string };
type Wd = { id: string; amount: number; bank_name: string; account_number: string; account_name: string; status: string; admin_note: string | null; created_at: string };

const WD_LABEL: Record<string, string> = { requested: "Menunggu transfer admin", paid: "Sudah ditransfer", rejected: "Ditolak, saldo kembali" };
const WD_TONE: Record<string, "warn" | "ok" | "bad"> = { requested: "warn", paid: "ok", rejected: "bad" };
const num = (v: unknown) => Number(v ?? 0) || 0;
const card = "rounded-xl border border-border bg-card";

export function ClientWalletPanel() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["client-wallet", uid],
    enabled: !!uid,
    refetchInterval: 60_000,
    queryFn: async () => {
      const w = await looseDb.rpc("client_wallet", {});
      if (w.error) {
        if (MISSING.test(errMsg(w.error))) return null; // SQL 011 belum diterapkan
        throw new Error(errMsg(w.error));
      }
      const r = ((w.data as Record<string, unknown>[] | null)?.[0]) ?? {};
      const wallet: Wallet = { available: num(r["available"]), requested: num(r["requested"]), paid_out: num(r["paid_out"]), total_in: num(r["total_in"]) };
      const [e, d] = await Promise.all([
        looseDb.from("client_wallet_entries").select("id,amount,kind,note,created_at").eq("client_id", uid!).order("created_at", { ascending: false }).limit(50),
        looseDb.from("client_withdrawals").select("id,amount,bank_name,account_number,account_name,status,admin_note,created_at").eq("client_id", uid!).order("created_at", { ascending: false }).limit(50),
      ]);
      return { wallet, entries: (e.data ?? []) as Entry[], withdrawals: (d.data ?? []) as Wd[] };
    },
  });

  if (q.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return null;
  const { wallet, entries, withdrawals } = q.data;
  const canWithdraw = wallet.available >= MIN_WITHDRAW;

  type Row = { key: string; at: string; node: React.ReactNode };
  const history: Row[] = [
    ...entries.map((x) => ({
      key: `e${x.id}`, at: x.created_at,
      node: (
        <li className={cn(card, "flex items-start gap-3 p-3")}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"><ArrowDownLeft className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">+ {formatRupiah(x.amount)}</p>
            <p className="text-xs text-muted-foreground">{x.kind === "refund" ? "Dana dikembalikan" : "Penyesuaian saldo"} · {timeAgo(x.created_at)}</p>
            {x.note && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{x.note}</p>}
          </div>
        </li>
      ),
    })),
    ...withdrawals.map((x) => ({
      key: `w${x.id}`, at: x.created_at,
      node: (
        <li className={cn(card, "flex items-start gap-3 p-3")}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-600"><ArrowUpRight className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">− {formatRupiah(x.amount)}</p>
              <Pill tone={WD_TONE[x.status] ?? "info"}>{WD_LABEL[x.status] ?? x.status}</Pill>
            </div>
            <p className="text-xs text-muted-foreground">Tarik ke {x.bank_name} {maskNumber(x.account_number)} a.n. {x.account_name} · {timeAgo(x.created_at)}</p>
            {x.admin_note && <p className="mt-1 rounded-lg bg-muted p-2 text-xs">Catatan admin: {x.admin_note}</p>}
          </div>
        </li>
      ),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section className="space-y-3" aria-label="Saldo client">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy to-navy-deep p-5 text-white shadow-md ring-1 ring-white/10">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-primary/30 blur-3xl" />
        <p className="relative flex items-center gap-2 text-sm text-white/70"><Wallet className="size-4" /> Saldo client</p>
        <p className="relative mt-1 text-3xl font-bold tracking-tight">{formatRupiah(wallet.available, "Rp0")}</p>
        <p className="relative mt-1 text-xs text-white/60">
          Dana yang dikembalikan dari sengketa, refund admin, atau kontrak yang ditutup masuk ke sini otomatis.
          {wallet.requested > 0 && ` Sedang ditarik: ${formatRupiah(wallet.requested)}.`}
          {wallet.paid_out > 0 && ` Sudah ditarik: ${formatRupiah(wallet.paid_out)}.`}
        </p>
        <div className="relative mt-4">
          <Button onClick={() => setOpen(true)} disabled={!canWithdraw}><ArrowUpRight /> Tarik saldo</Button>
          {!canWithdraw && <p className="mt-2 text-xs text-white/60">{wallet.available > 0 ? `Saldo belum mencapai minimal penarikan ${formatRupiah(MIN_WITHDRAW)}.` : "Belum ada saldo yang bisa ditarik."}</p>}
        </div>
      </div>

      {history.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold">Riwayat saldo</h2>
          <ul className="space-y-2">{history.map((h) => <Fragment key={h.key}>{h.node}</Fragment>)}</ul>
        </div>
      )}

      <WithdrawDialog open={open} available={wallet.available} onClose={() => setOpen(false)}
        onSent={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["client-wallet"] }); }} />
    </section>
  );
}

function WithdrawDialog({ open, available, onClose, onSent }: { open: boolean; available: number; onClose: () => void; onSent: () => void }) {
  const { user } = useAuth();
  const accounts = usePayoutAccounts(user?.id);
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
  const problem = !value ? null : value > available ? "Jumlah melebihi saldo tersedia." : value < MIN_WITHDRAW ? `Penarikan minimal ${formatRupiah(MIN_WITHDRAW)}.` : null;
  const targetOk = !!target && target.bank.length >= 2 && /^\d{5,25}$/.test(target.number) && target.name.length >= 2;
  const canSend = value > 0 && !problem && targetOk && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || !target) return;
    setBusy(true);
    const { error } = await looseDb.rpc("request_client_withdrawal", { _amount: value, _bank_name: target.bank, _account_number: target.number, _account_name: target.name });
    if (error) { setBusy(false); toast.error(errMsg(error)); return; }
    if (manual && nf.save) await accounts.add({ bank_name: target.bank, account_number: target.number, account_name: target.name });
    setBusy(false);
    toast.success("Penarikan diajukan. Admin akan mentransfer ke rekeningmu.");
    setAmount(""); setNf({ bank: "", number: "", name: "", save: true }); setChoice(null);
    onSent();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Tarik saldo client</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="cw-amount">Jumlah</Label>
            <RupiahInput id="cw-amount" value={amount} placeholder={`Tersedia ${formatRupiah(available, "Rp0")}`} onValueChange={setAmount} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {([["50%", 0.5], ["Semua", 1]] as const).map(([label, pct]) => (
                <button key={label} type="button" onClick={() => setAmount(String(Math.floor(available * pct)))} className="rounded-full border border-border px-3 py-1 text-xs transition hover:bg-accent">{label}</button>
              ))}
            </div>
            {problem && <p role="alert" className="mt-2 text-xs text-destructive">{problem}</p>}
          </div>

          <div>
            <p className="text-sm font-medium">Rekening tujuan</p>
            {list.length > 0 && (
              <div role="radiogroup" aria-label="Rekening tujuan" className="mt-2 grid gap-2">
                {list.map((a) => {
                  const on = !manual && selected?.id === a.id;
                  return (
                    <button key={a.id} type="button" role="radio" aria-checked={on} onClick={() => setChoice(a.id)}
                      className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition", on ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40")}>
                      <Landmark className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.bank_name} {maskNumber(a.account_number)}</span><span className="block truncate text-xs text-muted-foreground">a.n. {a.account_name}</span></span>
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
                  <Label htmlFor="cw-bank">Bank / e-wallet</Label>
                  <Input id="cw-bank" value={nf.bank} maxLength={60} placeholder="BCA, Mandiri, DANA…" onChange={(e) => setNf({ ...nf, bank: e.target.value })} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {BANK_PRESETS.map((b) => (
                      <button key={b} type="button" onClick={() => setNf({ ...nf, bank: b })} className={cn("rounded-full border px-2.5 py-1 text-xs transition", nf.bank === b ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent")}>{b}</button>
                    ))}
                  </div>
                </div>
                <div><Label htmlFor="cw-num">Nomor rekening</Label><Input id="cw-num" inputMode="numeric" value={nf.number} maxLength={30} onChange={(e) => setNf({ ...nf, number: e.target.value.replace(/[^\d\s]/g, "") })} /></div>
                <div><Label htmlFor="cw-name">Atas nama</Label><Input id="cw-name" value={nf.name} maxLength={100} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" className="size-4 accent-primary" checked={nf.save} onChange={(e) => setNf({ ...nf, save: e.target.checked })} /> Simpan rekening ini untuk penarikan berikutnya
                </label>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-muted p-3 text-sm">
            {value > 0 && targetOk && target
              ? <p>Kamu akan menarik <b>{formatRupiah(value)}</b> ke <b>{target.bank} {maskNumber(target.number)}</b> a.n. {target.name}. Admin memprosesnya secara manual; statusnya tampil di Riwayat saldo.</p>
              : <p className="text-muted-foreground">Isi jumlah dan rekening tujuan. Rangkuman muncul di sini.</p>}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={!canSend}>{busy ? <Loader2 className="animate-spin" /> : <ArrowUpRight />} Ajukan penarikan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
