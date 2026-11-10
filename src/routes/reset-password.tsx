import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Atur ulang kata sandi — Pastodev" },
      { name: "description", content: "Buat kata sandi baru untuk akun Pastodev kamu." },
      { property: "og:title", content: "Atur ulang kata sandi — Pastodev" },
      { property: "og:description", content: "Buat kata sandi baru untuk akun Pastodev." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Kata sandi diperbarui."); navigate({ to: "/" }); }
  }
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Kata sandi baru</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <div><Label htmlFor="np">Kata sandi baru</Label><Input id="np" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button className="w-full" disabled={busy}>Simpan</Button>
      </form>
    </main>
  );
}
