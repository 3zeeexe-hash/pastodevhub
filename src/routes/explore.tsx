import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RepoCard, type RepoCardData } from "@/components/repo-card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Jelajahi repositori — Pastodev" },
      { name: "description", content: "Temukan repositori publik terbaru dan terpopuler dari komunitas Pastodev." },
      { property: "og:title", content: "Jelajahi repositori — Pastodev" },
      { property: "og:description", content: "Repositori publik terpopuler dan terbaru di Pastodev." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Explore,
});

function Explore() {
  const [sort, setSort] = useState<"stars" | "updated" | "new">("stars");
  const [lang, setLang] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["explore", lang],
    queryFn: async () => {
      let q = supabase.from("repositories").select("id,name,description,language,is_private,created_at,updated_at,forked_from,topics, owner:profiles!repositories_owner_id_fkey(username,avatar_url), stars(count)").eq("is_private", false).limit(200);
      if (lang) q = q.eq("language", lang);
      return ((await q).data ?? []) as unknown as RepoCardData[];
    },
  });
  const list = [...(data ?? [])].sort((a, b) =>
    sort === "stars" ? (b.stars?.[0]?.count ?? 0) - (a.stars?.[0]?.count ?? 0)
      : sort === "updated" ? (b.updated_at ?? "").localeCompare(a.updated_at ?? "") : b.created_at.localeCompare(a.created_at));
  const langs = ["", "TypeScript", "JavaScript", "Python", "Go", "Rust", "PHP", "Java", "Kotlin", "Dart"];
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Jelajahi</h1>
      <p className="mt-1 text-muted-foreground">Repositori publik dari komunitas.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {(["stars", "updated", "new"] as const).map((s) => (
          <button key={s} onClick={() => setSort(s)} className={cn("rounded-full border border-border px-3 py-1 text-sm", sort === s ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
            {s === "stars" ? "Bintang terbanyak" : s === "updated" ? "Baru diperbarui" : "Terbaru"}
          </button>
        ))}
        <select value={lang} onChange={(e) => setLang(e.target.value)} className="ml-auto rounded-md border border-input bg-background px-2 py-1 text-sm" aria-label="Bahasa">
          {langs.map((l) => <option key={l} value={l}>{l || "Semua bahasa"}</option>)}
        </select>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
        {list.map((r) => <RepoCard key={r.id} r={r} />)}
      </div>
      {!isLoading && list.length === 0 && <p className="mt-6 rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">Belum ada repositori. <Link to="/new" className="text-link">Buat yang pertama</Link>.</p>}
    </main>
  );
}
