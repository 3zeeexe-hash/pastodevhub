import { createFileRoute } from "@tanstack/react-router";
import { VerificationPage } from "@/components/verification-page";

export const Route = createFileRoute("/studio/verifikasi")({
  head: () => ({
    meta: [
      { title: "Verifikasi akun — Pastodev" },
      { name: "description", content: "Ajukan centang biru untuk akunmu." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerificationPage,
});
