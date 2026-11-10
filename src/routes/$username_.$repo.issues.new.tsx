import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRepo, useRefreshRepo } from "@/lib/repo-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignInCta } from "@/components/sign-in-cta";
import { MdEditor } from "@/components/repo/md-editor";

export const Route = createFileRoute("/$username_/$repo/issues/new")({
  head: ({ params }) => ({
    meta: [
      { title: `Issue baru · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: "Laporkan bug atau usulkan ide." },
      { property: "og:title", content: `Issue baru · ${params.username}/${params.repo}` },
      { property: "og:description", content: "Laporkan bug atau usulkan ide." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewIssue,
});

function NewIssue() {
  const { username, repo } = Route.useParams();
  const { user } = useAuth();
  const { data: rd } = useRepo(username, repo);
  const refresh = useRefreshRepo(username, repo);
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  if (!rd) return null;
  if (!user) return <SignInCta text="Masuk untuk membuat issue." />;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.from("issues").insert({ repo_id: rd!.repo.id, author_id: user!.id, title: title.trim(), body }).select("number").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    refresh();
    navigate({ to: "/$username/$repo/issues/$number", params: { username, repo, number: String(data.number) } });
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-4">
      <h2 className="text-xl font-semibold">Issue baru</h2>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul" required maxLength={250} className="text-base" />
      <MdEditor value={body} onChange={setBody} placeholder="Jelaskan masalah atau ide kamu…" minH="min-h-[240px]" />
      <Button disabled={busy || !title.trim()}>Kirim issue baru</Button>
    </form>
  );
}
