import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { fetchUserFilters, setUserFilter } from "@/lib/feed-moderation";
import { AvatarMini } from "@/components/avatar-mini";
import { Button } from "@/components/ui/button";

/** Daftar akun yang disenyapkan atau diblokir, dengan tombol untuk membatalkan. Untuk halaman Pengaturan. */
export function BlockedUsersCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["feed-user-filters", user?.id ?? null], queryFn: () => fetchUserFilters(user!.id), enabled: !!user });
  const undo = useMutation({
    mutationFn: (targetId: string) => setUserFilter(user!.id, targetId, null),
    onSuccess: async () => {
      toast.success("Dikembalikan seperti semula");
      await Promise.all([qc.invalidateQueries({ queryKey: ["feed-user-filters"] }), qc.invalidateQueries({ queryKey: ["feed"] })]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="blocked-title">
      <h2 id="blocked-title" className="text-lg font-semibold">Akun disenyapkan &amp; diblokir</h2>
      <p className="mt-1 text-sm text-muted-foreground">Post mereka tidak muncul di Diskusi. Akun yang diblokir juga tidak bisa mengirim pesan padamu.</p>
      <div className="mt-4">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : list.error ? (
          <p className="text-sm text-muted-foreground">Daftar belum tersedia.</p>
        ) : !list.data?.length ? (
          <p className="text-sm text-muted-foreground">Belum ada. Gunakan menu ⋯ di sebuah post untuk menyenyapkan atau memblokir penulisnya.</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.data.map((f) => (
              <li key={f.target_id} className="flex items-center gap-3 py-2">
                <AvatarMini name={f.profile?.username ?? "?"} url={f.profile?.avatar_url ?? null} size={32} />
                <div className="min-w-0 flex-1">
                  {f.profile ? (
                    <Link to="/$username" params={{ username: f.profile.username }} className="truncate font-mono text-sm hover:underline">@{f.profile.username}</Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">(akun dihapus)</span>
                  )}
                  <p className="text-xs text-muted-foreground">{f.kind === "block" ? "Diblokir" : "Disenyapkan"}</p>
                </div>
                <Button size="sm" variant="outline" disabled={undo.isPending} onClick={() => undo.mutate(f.target_id)}>{f.kind === "block" ? "Buka blokir" : "Batal senyap"}</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
