import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { ROLE_EVENT, ROLE_INFO, accountTypeFor, isRole, pickStoredRole, readStoredRole, resolveRole, roleFitsAccount, writeStoredRole, type Role } from "@/lib/roles";

// Tabel user_role_prefs belum ada di tipe hasil generate sampai SQL 0008 diterapkan.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type RolePref = { missing: boolean; active: string | null };
const prefKey = (uid: string | undefined) => ["role-pref", uid];

/** Simpan peran aktif ke database. Mengembalikan false kalau tabel belum aktif atau gagal. */
async function savePref(uid: string, role: Role): Promise<boolean> {
  const { error } = await sb.from("user_role_prefs").upsert({ user_id: uid, active_role: role }, { onConflict: "user_id" });
  return !error;
}

function subscribe(cb: () => void) {
  window.addEventListener(ROLE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(ROLE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Peran aktif untuk tampilan, plus fungsi untuk berganti peran.
 * Sumber utama: tabel user_role_prefs. localStorage jadi cadangan dan cache,
 * jadi tampilan tidak berkedip dan tetap jalan sebelum SQL 0008 diterapkan.
 */
export function useRole() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const stored = useSyncExternalStore(subscribe, readStoredRole, () => null);
  const [switching, setSwitching] = useState(false);
  const accountType = profile?.account_type ?? null;

  const pref = useQuery({
    queryKey: prefKey(user?.id),
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RolePref> => {
      const { data, error } = await sb.from("user_role_prefs").select("active_role").eq("user_id", user!.id).maybeSingle();
      if (error) return { missing: true, active: null };
      return { missing: false, active: (data?.active_role as string | undefined) ?? null };
    },
  });
  const dbRole = pref.data?.active ?? null;
  const role = resolveRole(pickStoredRole(dbRole, stored, accountType), accountType);

  // Samakan cache perangkat dengan database; kalau database masih kosong, pindahkan peran perangkat ini ke sana.
  useEffect(() => {
    if (!user || !pref.data || pref.data.missing) return;
    if (isRole(dbRole) && roleFitsAccount(dbRole, accountType)) {
      if (stored !== dbRole) writeStoredRole(dbRole);
      return;
    }
    if (isRole(stored) && roleFitsAccount(stored, accountType)) {
      void savePref(user.id, stored).then((ok) => {
        if (ok) qc.setQueryData(prefKey(user.id), { missing: false, active: stored } satisfies RolePref);
      });
    }
  }, [user, pref.data, dbRole, stored, accountType, qc]);

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
    // Peran disimpan ke database; kalau tabel belum aktif, cadangan perangkat tetap dipakai.
    if (pref.data?.missing !== true && (await savePref(user.id, next))) {
      qc.setQueryData(prefKey(user.id), { missing: false, active: next } satisfies RolePref);
    }
    writeStoredRole(next);
    toast.success(`Mode ${ROLE_INFO[next].title} aktif`);
    void qc.invalidateQueries({ queryKey: ["me"] });
    return true;
  }, [user, profile, qc, pref.data?.missing]);

  return { role, setRole, switching };
}
