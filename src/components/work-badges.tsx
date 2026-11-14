import { useWorkChatUnread, useWorkNotifUnread } from "@/lib/use-work-unread";

/** Lencana angka merah kecil untuk menu samping dan chip GOBI WORK. */
export function CountDot({ n, className = "" }: { n: number | undefined; className?: string }) {
  if (!n) return null;
  return <span aria-label={`${n} belum dibaca`} className={`ml-auto min-w-5 shrink-0 rounded-full bg-red-500 px-1.5 text-center font-mono text-[10px] font-bold leading-5 text-white ${className}`}>{n > 99 ? "99+" : n}</span>;
}

export function WorkNotifBadge() {
  const q = useWorkNotifUnread();
  return <CountDot n={q.data} />;
}

export function WorkChatBadge() {
  const q = useWorkChatUnread();
  return <CountDot n={q.data} />;
}
