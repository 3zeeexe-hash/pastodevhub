import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Pesan kerja tidak punya halaman sendiri lagi: semua pesan (pribadi, kerja, pesanan) ada di satu halaman, /gobifeed/pesan.
 * Rute ini dipertahankan hanya supaya tautan dan notifikasi lama (/kerja/pesan?application=...) tetap sampai ke percakapan yang benar.
 */
export const Route = createFileRoute("/kerja/pesan")({
  validateSearch: (s: Record<string, unknown>): { application?: string } => (typeof s.application === "string" ? { application: s.application } : {}),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/gobifeed/pesan", search: search.application ? { application: search.application } : { filter: "kerja" }, replace: true });
  },
});
