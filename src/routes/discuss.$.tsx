// /discuss/<apa pun> -> /gobifeed/<apa pun> (status, tag, pesan, tersimpan, forum). Lihat discuss.index.tsx.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/discuss/$")({
  beforeLoad: ({ params, location }) => {
    const rest = (params._splat ?? "").replace(/^\/+/, "");
    throw redirect({ href: `/gobifeed${rest ? `/${rest}` : ""}${location.searchStr}`, statusCode: 301 });
  },
});
