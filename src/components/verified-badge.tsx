import { useQuery } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { TIER_META, asTier, type VerifiedTier } from "@/lib/verification-tier";

type VerifiedRow = { username: string; tier: VerifiedTier };

const toSet = (rows: VerifiedRow[]) => new Set(rows.map((r) => r.username));
const toTierMap = (rows: VerifiedRow[]) => new Map(rows.map((r) => [r.username, r.tier] as const));

/** Every verified account with its tier (blue, green, or red), loaded once and shared by all badges on the page. */
const verifiedList = {
  queryKey: ["verified-usernames"],
  staleTime: 5 * 60_000,
  queryFn: async (): Promise<VerifiedRow[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    let res = await sb.from("profiles").select("username,verified_tier").eq("is_verified", true).limit(5000);
    // Tier column not there yet (docs/sql/0010 not applied): every verified account is blue.
    if (res.error) res = await sb.from("profiles").select("username").eq("is_verified", true).limit(5000);
    // Column not there at all (docs/sql/0004 not applied): no badges, nothing breaks.
    if (res.error) return [];
    return ((res.data ?? []) as { username: string; verified_tier?: unknown }[]).map((r) => ({
      username: r.username,
      tier: asTier(r.verified_tier) ?? "verified",
    }));
  },
};

/** Usernames of every verified account (developer, freelancer, client, or personal). */
export function useVerifiedUsernames() {
  return useQuery({ ...verifiedList, select: toSet });
}

/** Tier of every verified account by username; accounts without a check are absent. */
export function useVerifiedTiers() {
  return useQuery({ ...verifiedList, select: toTierMap });
}

/**
 * Check next to a verified account's name: blue = verified, green = official account, red = owner.
 * Pass `username` (looked up in the shared list) or `verified` when the profile row is already at hand;
 * pass `tier` when the row already carries it.
 */
export function VerifiedBadge({ username, verified, tier, size = 16, className }: {
  username?: string | null | undefined;
  verified?: boolean | null | undefined;
  tier?: string | null | undefined;
  size?: number | undefined;
  className?: string | undefined;
}) {
  const { data } = useVerifiedTiers();
  const given = asTier(tier);
  // Wait for the shared list before drawing a looked-up badge, so it never flashes blue and then turns green or red.
  if (!given && username && data === undefined) return null;
  const fromList = username ? data?.get(username) : undefined;
  const on = given ? true : typeof verified === "boolean" ? verified : !!fromList;
  if (!on) return null;
  const meta = TIER_META[given ?? fromList ?? "verified"];
  return (
    <span title={meta.title} role="img" aria-label={meta.title} className={cn("inline-flex shrink-0 align-middle", className)}>
      <BadgeCheck width={size} height={size} className={cn(meta.fill, "text-white")} />
    </span>
  );
}

/** Small colored label ("Akun resmi", "Pemilik") for profile pages; nothing for plain verified or unverified accounts. */
export function VerifiedTierLabel({ username, className }: { username: string; className?: string | undefined }) {
  const { data } = useVerifiedTiers();
  const tier = data?.get(username);
  if (!tier || tier === "verified") return null;
  const meta = TIER_META[tier];
  return <span className={cn("inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", meta.pill, className)}>{meta.label}</span>;
}
