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
/**
 * Peran yang ditolak database tetap dipakai di perangkat ini. Dibagi antar semua pemakai useRole,
 * supaya muat ulang data dari database tidak mengembalikannya ke peran lama. Hilang saat halaman dimuat ulang.
 */
let deviceOnlyRole: Role | null = null;
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
  const deviceOnly = deviceOnlyRole !== null && stored === deviceOnlyRole && roleFitsAccount(deviceOnlyRole, accountType);
  const role = resolveRole(deviceOnly ? stored : pickStoredRole(dbRole, stored, accountType), accountType);

  // Samakan cache perangkat dengan database; kalau database masih kosong, pindahkan peran perangkat ini ke sana.
  useEffect(() => {
    if (!user || !pref.data || pref.data.missing) return;
    if (deviceOnly) return;
    if (isRole(dbRole) && roleFitsAccount(dbRole, accountType)) {
      if (stored !== dbRole) writeStoredRole(dbRole);
      return;
    }
    if (isRole(stored) && roleFitsAccount(stored, accountType)) {
      void savePref(user.id, stored).then((ok) => {
        if (ok) qc.setQueryData(prefKey(user.id), { missing: false, active: stored } satisfies RolePref);
      });
    }
  }, [user, pref.data, dbRole, stored, accountType, deviceOnly, qc]);

  /**
   * Simpan peran pilihan ke database dan ke cache perangkat. Tidak mengubah jenis akun dan tidak menampilkan toast sukses.
   * Semua jalur yang memilih peran (header, Pengaturan, prompt pertama kali) lewat sini supaya database dan perangkat
   * selalu searah: kalau hanya perangkat yang ditulis, sinkronisasi di atas mengembalikannya ke peran lama dari database.
   * Mengembalikan false hanya kalau database menolak; tabel yang belum aktif memang memakai cadangan perangkat.
   */
  const saveRole = useCallback(async (next: Role): Promise<boolean> => {
    if (!user) { writeStoredRole(next); return true; }
    if (pref.data?.missing === true) { writeStoredRole(next); return true; }
    const saved = await savePref(user.id, next);
    if (saved) {
      deviceOnlyRole = null;
      qc.setQueryData(prefKey(user.id), { missing: false, active: next } satisfies RolePref);
    } else {
      // Database menolak (mis. aturan tabel belum memuat peran ini): pilihan perangkat dipertahankan, bukan dikembalikan ke peran lama.
      deviceOnlyRole = next;
      qc.setQueryData(prefKey(user.id), { missing: true, active: null } satisfies RolePref);
      toast.warning(`Mode ${ROLE_INFO[next].title} aktif di perangkat ini, tapi belum tersimpan di server.`);
    }
    writeStoredRole(next);
    return saved;
  }, [user, qc, pref.data?.missing]);

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
    if (await saveRole(next)) toast.success(`Mode ${ROLE_INFO[next].title} aktif`);
    void qc.invalidateQueries({ queryKey: ["me"] });
    return true;
  }, [user, profile, qc, saveRole]);

  return { role, setRole, saveRole, switching };
}
