import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { openChatDock } from "@/lib/chat-dock";

// Obrolan kerja sekarang ada di chat mengambang (tab GOBI Work). Alamat lama ini tetap hidup untuk tautan lama dan notifikasi:
// halamannya mengarahkan ke Ringkasan lalu membuka chat mengambang pada obrolan yang dimaksud.
export const Route = createFileRoute("/kerja/pesan")({
  validateSearch: (s: Record<string, unknown>) => ({ application: typeof s.application === "string" ? s.application : undefined }),
  component: WorkMessagesRedirect,
});

function WorkMessagesRedirect() {
  const { application } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/kerja", replace: true });
    // Panel chat menutup diri saat alamat berganti, jadi dibuka sesudah perpindahan selesai.
    window.setTimeout(() => openChatDock({ view: "work", applicationId: application }), 300);
  }, [application, navigate]);
  return <p className="py-12 text-center text-sm text-muted-foreground">Membuka chat GOBI Work…</p>;
}
