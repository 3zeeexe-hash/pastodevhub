import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  website: string | null;
  company: string | null;
  created_at: string;
  account_type: "client" | "developer" | null;
  headline: string | null;
  skills: string[];
  links: unknown;
  available_for_hire: boolean;
};
type Ctx = { user: User | null; profile: Profile | null; loading: boolean; isAdmin: boolean; adminLoading: boolean };
const AuthCtx = createContext<Ctx>({ user: null, profile: null, loading: true, isAdmin: false, adminLoading: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === "SIGNED_IN" || event === "USER_UPDATED") qc.invalidateQueries();
      if (event === "SIGNED_OUT") qc.clear();
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);
  const { data: profile } = useQuery({
    queryKey: ["me", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (data) return data as Profile;
      // Account exists but its profile is missing (e.g. created before sign-up setup): create it.
      await supabase.rpc("ensure_my_profile");
      const again = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return (again.data ?? null) as Profile | null;
    },
  });
  const { data: isAdmin, isPending: adminPending } = useQuery({
    queryKey: ["me-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" });
      return !!data;
    },
  });
  return <AuthCtx.Provider value={{ user, profile: profile ?? null, loading, isAdmin: !!isAdmin, adminLoading: !!user && adminPending }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

export function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} hari lalu`;
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
