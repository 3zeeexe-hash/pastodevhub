import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { AccountType } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountTypePicker } from "@/components/account-type-picker";

/** Set on the sign-up page before Google/Lovable sign-in, so the choice survives the redirect. */
export const PENDING_TYPE_KEY = "pastodev-pending-account-type";

/** Asks signed-in users without an account type (Google/Lovable sign-ups, older accounts) to pick one. */
export function AccountTypePrompt() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [v, setV] = useState<AccountType | null>(null);
  const [busy, setBusy] = useState(false);
  const autoTried = useRef(false);

  async function save(type: AccountType) {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ account_type: type }).eq("id", profile.id);
    setBusy(false);
    if (error) { toast.error("Gagal menyimpan jenis akun. Coba lagi."); return; }
    window.localStorage.removeItem(PENDING_TYPE_KEY);
    toast.success(type === "developer" ? "Akun developer aktif" : "Akun client aktif");
    await qc.invalidateQueries({ queryKey: ["me"] });
  }

  // Apply the choice made on the sign-up page before a Google/Lovable redirect.
  useEffect(() => {
    if (!profile || profile.account_type || autoTried.current) return;
    autoTried.current = true;
    const pending = window.localStorage.getItem(PENDING_TYPE_KEY);
    if (pending === "developer" || pending === "client") { setV(pending); void save(pending); }
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile || profile.account_type) return null;
  return (
    <Dialog open>
      <DialogContent
        className="max-w-md [&>button.absolute]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Selamat datang, {profile.display_name || profile.username}!</DialogTitle>
          <DialogDescription>Kamu mau pakai Pastodev sebagai apa? Bisa diganti nanti di Pengaturan.</DialogDescription>
        </DialogHeader>
        <AccountTypePicker value={v} onChange={setV} />
        <Button onClick={() => v && save(v)} disabled={!v || busy} className="w-full">
          {busy && <Loader2 className="animate-spin" />} {v ? `Lanjut sebagai ${v === "developer" ? "Developer" : "Client"}` : "Pilih salah satu dulu"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
