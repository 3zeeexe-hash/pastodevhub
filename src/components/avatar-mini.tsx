export function AvatarMini({ name, url, size = 28 }: { name: string; url?: string | null | undefined; size?: number | undefined }) {
  if (url) return <img src={url} alt="" width={size} height={size} className="rounded-full border border-border object-cover" style={{ width: size, height: size }} />;
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-secondary font-mono font-semibold text-primary" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
