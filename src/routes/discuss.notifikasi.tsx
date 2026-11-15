import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Notifikasi Diskusi sudah digabung ke halaman /notifikasi (tab Aktivitas ada di sana).
 * Rute ini dipertahankan hanya supaya tautan lama, bookmark, dan notifikasi yang sudah terkirim tetap sampai.
 */
export const Route = createFileRoute("/discuss/notifikasi")({
  beforeLoad: () => {
    throw redirect({ to: "/notifikasi", search: {}, replace: true });
  },
});
