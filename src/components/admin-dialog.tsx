import { useCallback, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AskContext, type Ask, type AskOptions, type AskResult } from "@/lib/admin-ask";

/**
 * Pengganti `confirm()` dan `prompt()` bawaan browser di halaman admin.
 * `ask()` membuka dialog bertema GOBI dan mengembalikan Promise: `null` kalau admin membatalkan,
 * atau `{ reason }` (teks alasan, "" kalau tidak diminta atau dikosongkan) kalau admin melanjutkan.
 * Disediakan oleh `AdminShell`, jadi bisa dipakai di semua halaman dan komponen di bawah /admin.
 */
export function AdminDialogProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<AskOptions | null>(null);
  const [reason, setReason] = useState("");
  const resolver = useRef<((r: AskResult) => void) | null>(null);

  const ask = useCallback<Ask>((o) => {
    // Kalau ada dialog yang masih terbuka, anggap dibatalkan supaya Promise-nya tidak menggantung.
    resolver.current?.(null);
    setReason("");
    setOpts(o);
    return new Promise<AskResult>((resolve) => { resolver.current = resolve; });
  }, []);

  function close(result: AskResult) {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  }

  const trimmed = reason.trim();
  const blocked = !!opts?.reason?.required && !trimmed;
  const Icon = opts?.destructive ? AlertTriangle : HelpCircle;

  return (
    <AskContext.Provider value={ask}>
      {children}
      <Dialog open={!!opts} onOpenChange={(o) => { if (!o) close(null); }}>
        <DialogContent className="max-w-md rounded-3xl">
          {opts && (
            <form onSubmit={(e) => { e.preventDefault(); if (!blocked) close({ reason: trimmed }); }} className="space-y-4">
              <DialogHeader className="space-y-2 text-left">
                <span className={`flex size-10 items-center justify-center rounded-full ${opts.destructive ? "bg-destructive/10 text-destructive" : "bg-primary/15 text-primary"}`}>
                  <Icon className="size-5" />
                </span>
                <DialogTitle>{opts.title}</DialogTitle>
                {opts.description ? <DialogDescription>{opts.description}</DialogDescription> : <DialogDescription className="sr-only">Konfirmasi tindakan admin</DialogDescription>}
              </DialogHeader>
              {opts.reason && (
                <div className="space-y-1.5">
                  <Label htmlFor="admin-ask-reason">{opts.reason.label}{opts.reason.required ? "" : " (opsional)"}</Label>
                  <Textarea id="admin-ask-reason" autoFocus rows={3} maxLength={500} value={reason} placeholder={opts.reason.placeholder} onChange={(e) => setReason(e.target.value)} />
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => close(null)}>Batal</Button>
                <Button type="submit" variant={opts.destructive ? "destructive" : "default"} className="rounded-full" disabled={blocked}>{opts.confirmLabel ?? "Lanjutkan"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AskContext.Provider>
  );
}
