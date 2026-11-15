import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Notifikasi GOBI WORK sudah digabung ke halaman /notifikasi (tab Kerja ada di sana).
 * Rute ini dipertahankan hanya supaya tautan lama, bookmark, dan notifikasi yang sudah terkirim tetap sampai.
 */
export const Route = createFileRoute("/kerja/notifikasi")({
  beforeLoad: () => {
    throw redirect({ to: "/notifikasi", search: {}, replace: true });
  },
});
