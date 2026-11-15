import type { ComponentProps } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchDmUnread } from "@/lib/dm";
import { messengerSearch } from "@/lib/inbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonProps = ComponentProps<typeof Button>;

/**
 * Satu-satunya cara halaman lain (lowongan, lamaran, jasa, pesanan, profil) menawarkan chat: tombol yang membuka halaman Pesan
 * pada percakapan yang tepat. Halaman itu tidak boleh punya kolom ketik sendiri.
 *  - `username`: pesan pribadi (dibuat otomatis bila belum ada)
 *  - `application`: obrolan lamaran (client dan pelamar)
 *  - `order`: chat pesanan (pembeli dan penjual)
 */
export function MessageButton({
  username, application, order, label = "Pesan", variant = "outline", size = "sm", className,
}: {
  username?: string | undefined; application?: string | undefined; order?: string | undefined;
  label?: string; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string | undefined;
}) {
  return (
    <Button asChild variant={variant} size={size} className={cn("rounded-full", className)}>
      <Link to="/gobifeed/pesan" search={messengerSearch({ username, application, order })}><MessageCircle /> {label}</Link>
    </Button>
  );
}

/** Lencana jumlah percakapan belum dibaca (pesan pribadi + obrolan kerja). Kunci kuerinya dipakai bersama menu, header, dan menu bawah. */
export function MessagesBadge({ className }: { className?: string }) {
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: ["dm-unread", user?.id ?? null], queryFn: () => fetchDmUnread(user?.id), enabled: !!user, refetchInterval: 60_000 });
  if (!data) return null;
  return <span className={cn("min-w-5 rounded-full bg-red-500 px-1.5 text-center font-mono text-[11px] leading-5 text-white", className)}>{data > 99 ? "99+" : data}</span>;
}
