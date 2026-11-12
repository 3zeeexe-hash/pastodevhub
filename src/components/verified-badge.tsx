import { useQuery } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const toSet = (names: string[]) => new Set(names);

/** Usernames of every verified account (developer, freelancer, client, or personal), loaded once and shared by all badges on the page. */
export function useVerifiedUsernames() {
  return useQuery({
    queryKey: ["verified-usernames"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("profiles").select("username").eq("is_verified", true).limit(5000);
      // Column not there yet (database change not applied): no badges, nothing breaks.
      if (error) return [];
      return (data ?? []).map((r: { username: string }) => r.username);
    },
    select: toSet,
  });
}

/**
 * Blue check next to a verified account's name. Pass `username` (looked up in the shared list)
 * or `verified` when the profile row is already at hand.
 */
export function VerifiedBadge({ username, verified, size = 16, className }: {
  username?: string | null | undefined;
  verified?: boolean | null | undefined;
  size?: number | undefined;
  className?: string | undefined;
}) {
  const { data } = useVerifiedUsernames();
  const on = typeof verified === "boolean" ? verified : username ? !!data?.has(username) : false;
  if (!on) return null;
  return (
    <span title="Akun terverifikasi" role="img" aria-label="Akun terverifikasi" className={cn("inline-flex shrink-0 align-middle", className)}>
      <BadgeCheck width={size} height={size} className="fill-sky-500 text-white" />
    </span>
  );
}
