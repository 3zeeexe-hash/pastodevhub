/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, LogOut, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const sb = supabase as any;

/** Status blokir akun yang sedang masuk. Dicek ulang tiap menit dan setiap kali tab dibuka lagi. */
export function useMyBan() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["me-ban", user?.id],
    enabled: !!user,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const uid = user!.id;
      const [flag, row] = await Promise.all([
        sb.rpc("is_banned", { _user: uid }),
        sb.from("user_bans").select("reason,created_at").eq("user_id", uid).maybeSingle(),
      ]);
      // Baris blokir yang bisa dibaca sendiri sudah bukti; fungsi is_banned jadi cadangan kalau tabelnya tertutup.
      const banned = !!row.data || (!flag.error && !!flag.data);
      return { banned, reason: (row.data?.reason as string | undefined) ?? "", since: (row.data?.created_at as string | undefined) ?? null };
    },
  });
}

/** Akun yang diblokir tidak melihat halaman GoBi apa pun, hanya layar ini. */
export function BanGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const ban = useMyBan();
  if (!loading && user && ban.data?.banned) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md rounded-2xl bg-card p-6 text-center shadow-lg ring-1 ring-destructive/40">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive"><Ban className="size-7" /></span>
          <h1 className="mt-4 text-xl font-bold">Akun kamu diblokir</h1>
          <p className="mt-2 text-sm text-muted-foreground">Kamu tidak bisa membuka halaman GoBi selama akun ini diblokir oleh pengelola.</p>
          {ban.data.reason && (
            <div className="mt-4 rounded-xl bg-secondary p-3 text-left text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alasan</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{ban.data.reason}</p>
            </div>
          )}
          {ban.data.since && <p className="mt-3 text-xs text-muted-foreground">Diblokir sejak {new Date(ban.data.since).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => void ban.refetch()} disabled={ban.isFetching}><RefreshCw className={ban.isFetching ? "animate-spin" : undefined} /> Cek lagi</Button>
            <Button onClick={() => void supabase.auth.signOut()}><LogOut /> Keluar</Button>
          </div>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
