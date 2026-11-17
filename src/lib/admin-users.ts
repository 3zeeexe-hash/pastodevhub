/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errMsg } from "@/lib/market";
import { useAskAdmin } from "@/lib/admin-ask";
import { sb } from "@/lib/admin-db";
import { TIER_META, type VerifiedTier } from "@/lib/verification-tier";

/** Fungsi database belum dibuat (perubahan SQL belum diterapkan). */
function isMissingFunction(e: { code?: string; message?: string }) {
  return e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? "");
}

export type UserRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  account_type: string | null;
  created_at: string;
  is_verified?: boolean | null;
  available_for_hire?: boolean | null;
  headline?: string | null;
  location?: string | null;
};

type Result = { error: { message: string } | null };

/** Aksi admin atas satu akun. Dipakai bersama oleh daftar pengguna dan panel detail. */
export function useUserActions() {
  const ask = useAskAdmin();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, ok: string, fn: () => PromiseLike<Result>) {
    setBusy(id);
    let error: Result["error"] = null;
    try {
      ({ error } = await fn());
    } catch (e) {
      error = { message: errMsg(e) };
    }
    setBusy(null);
    if (error) { toast.error(errMsg(error)); return false; }
    toast.success(ok);
    for (const key of ["admin-users", "admin-user", "verified-usernames", "admin-overview"]) qc.invalidateQueries({ queryKey: [key] });
    return true;
  }

  /** Beri centang biru / hijau / merah, atau cabut (tier = null). Akun apa pun boleh, tidak harus developer. */
  function setTier(u: { id: string }, tier: VerifiedTier | null) {
    const ok = tier ? `Centang ${TIER_META[tier].colorName} diberikan (${TIER_META[tier].label})` : "Centang dicabut";
    return act(u.id, ok, async () => {
      const r = await sb.rpc("admin_set_verified_tier", { _user: u.id, _tier: tier });
      if (r.error && isMissingFunction(r.error)) {
        // docs/sql/0010 belum diterapkan: biru dan cabut masih bisa lewat fungsi lama; hijau dan merah belum.
        if (tier === null || tier === "verified") return sb.rpc("admin_set_verified", { _user: u.id, _verified: tier === "verified" });
        return { error: { message: "Centang hijau dan merah butuh perubahan database dari docs/sql/0010_tingkat_centang.sql. Terapkan lewat Lovable dulu." } };
      }
      // Catatan audit hanya pelengkap: gagal mencatat tidak membatalkan centangnya.
      if (!r.error) {
        try { await sb.rpc("admin_log_event", { _action: tier ? `user_tier_${tier}` : "user_tier_removed", _target_type: "profile", _target_id: u.id, _note: tier ?? "" }); } catch { /* abaikan */ }
      }
      return r;
    });
  }

  async function toggleBan(u: { id: string; username: string }, banned: boolean) {
    if (banned) return act(u.id, "Blokir dibuka. Akun bisa mengakses situs lagi.", () => sb.rpc("admin_set_ban", { _user: u.id, _banned: false, _reason: "" }));
    const res = await ask({
      title: `Blokir @${u.username}?`,
      description: "Akun ini langsung tidak bisa membuka halaman GoBi mana pun dan tidak bisa menambah atau mengubah konten. Alasan di bawah ditampilkan kepada pengguna. Blokir bisa dibuka lagi kapan saja.",
      confirmLabel: "Blokir akun",
      destructive: true,
      reason: { label: "Alasan memblokir", placeholder: "Contoh: spam berulang, penipuan, melanggar aturan komunitas", required: true },
    });
    if (!res) return false;
    return act(u.id, "Akun diblokir", () => sb.rpc("admin_set_ban", { _user: u.id, _banned: true, _reason: res.reason }));
  }

  async function toggleAdmin(u: { id: string; username: string }, isAdmin: boolean) {
    const ok = await ask(isAdmin
      ? { title: `Cabut role admin dari @${u.username}?`, confirmLabel: "Cabut role admin", destructive: true }
      : { title: `Jadikan @${u.username} admin?`, description: "Admin bisa mengatur seluruh situs.", confirmLabel: "Jadikan admin" });
    if (!ok) return false;
    return act(u.id, isAdmin ? "Role admin dicabut" : "Dijadikan admin", () => sb.rpc("admin_set_admin", { _user: u.id, _admin: !isAdmin }));
  }

  function setType(u: { id: string }, type: "developer" | "client") {
    return act(u.id, `Jenis akun diubah ke ${type === "developer" ? "Developer" : "Client"}`, async () => {
      const r = await sb.from("profiles").update({ account_type: type }).eq("id", u.id).select("id");
      // Kebijakan database yang menolak update tidak mengembalikan error, hanya nol baris.
      if (!r.error && (r.data ?? []).length === 0) return { error: { message: "Perubahan ditolak database: admin belum punya izin mengubah profil pengguna lain." } };
      return r;
    });
  }

  return { busy, setTier, toggleBan, toggleAdmin, setType };
}
