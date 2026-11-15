// URL lama /discuss sudah pindah ke /gobifeed (Linimasa dan Diskusi digabung jadi satu GobiFeed).
// Redirect permanen supaya tautan yang sudah dibagikan dan hasil Google lama tetap sampai ke halaman yang benar.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/discuss/")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: `/gobifeed${location.searchStr}`, statusCode: 301 });
  },
});
