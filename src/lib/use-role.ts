import { useCallback, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { ROLE_EVENT, ROLE_INFO, accountTypeFor, readStoredRole, resolveRole, writeStoredRole, type Role } from "@/lib/roles";

function subscribe(cb: () => void) {
  window.addEventListener(ROLE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(ROLE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Peran aktif untuk tampilan, plus fungsi untuk berganti peran. */
export function useRole() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const stored = useSyncExternalStore(subscribe, readStoredRole, () => null);
  const [switching, setSwitching] = useState(false);
  const role = resolveRole(stored, profile?.account_type ?? null);

  /** Berganti peran. Kalau jenis akun database ikut berubah, disimpan dulu; mengembalikan true kalau berhasil. */
  const setRole = useCallback(async (next: Role) => {
    if (!user || !profile) { writeStoredRole(next); return true; }
    const type = accountTypeFor(next);
    if (profile.account_type !== type) {
      setSwitching(true);
      const { error } = await supabase.from("profiles").update({ account_type: type }).eq("id", profile.id);
      setSwitching(false);
      if (error) { toast.error(errMsg(error)); return false; }
      qc.setQueryData(["me", user.id], (old: Profile | null | undefined) => (old ? { ...old, account_type: type } : old));
    }
    writeStoredRole(next);
    toast.success(`Mode ${ROLE_INFO[next].title} aktif`);
    void qc.invalidateQueries({ queryKey: ["me"] });
    return true;
  }, [user, profile, qc]);

  return { role, setRole, switching };
}
