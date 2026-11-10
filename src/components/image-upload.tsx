import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { errMsg, uploadMedia } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ImageUpload({ value, onChange, folder, label = "Unggah gambar", round = false, className }: {
  value: string | null; onChange: (url: string | null) => void; folder: string; label?: string; round?: boolean; className?: string;
}) {
  const { user } = useAuth();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(f: File | undefined) {
    if (!f || !user) return;
    setBusy(true);
    try { onChange(await uploadMedia(user.id, f, folder)); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("relative flex shrink-0 items-center justify-center overflow-hidden border border-dashed border-border bg-muted", round ? "size-20 rounded-full" : "aspect-video w-40 rounded-md")}>
        {value ? <img src={value} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6 text-muted-foreground" />}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-background/70"><Loader2 className="size-5 animate-spin" /></div>}
      </div>
      <div className="flex flex-col gap-1.5">
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => ref.current?.click()}>{label}</Button>
        {value && <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}><X /> Hapus</Button>}
        <span className="text-xs text-muted-foreground">PNG/JPG/WebP, maks 5 MB</span>
      </div>
    </div>
  );
}
