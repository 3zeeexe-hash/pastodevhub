/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errMsg } from "@/lib/market";
import { useAskAdmin } from "@/lib/admin-ask";
import { sb } from "@/lib/admin-db";

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

  function toggleVerified(u: { id: string; is_verified?: boolean | null }) {
    return act(u.id, u.is_verified ? "Centang biru dicabut" : "Developer diverifikasi", () => sb.rpc("admin_set_verified", { _user: u.id, _verified: !u.is_verified }));
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

  return { busy, toggleVerified, toggleBan, toggleAdmin, setType };
}
