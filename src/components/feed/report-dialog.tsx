import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { submitReport } from "@/lib/feed-moderation";
import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason } from "@/lib/feed-rules";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

/** Dialog untuk melaporkan sebuah post ke admin. */
export function ReportDialog({ postId, open, onOpenChange }: { postId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason>("spam");
  const [note, setNote] = useState("");

  const send = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Masuk dulu.");
      return submitReport(user.id, postId, reason, note);
    },
    onSuccess: () => {
      toast.success("Laporan terkirim. Admin akan meninjaunya.");
      setNote("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Klik di dalam dialog tidak boleh sampai ke kartu post di belakangnya. */}
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Laporkan post</DialogTitle>
          <DialogDescription>Pilih alasan yang paling sesuai. Identitasmu tidak ditampilkan kepada penulis post.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReportReason)} className="gap-3">
          {REPORT_REASONS.map((r) => (
            <div key={r.value} className="flex items-center gap-2">
              <RadioGroupItem id={`report-${postId}-${r.value}`} value={r.value} />
              <Label htmlFor={`report-${postId}-${r.value}`} className="cursor-pointer font-normal">{r.label}</Label>
            </div>
          ))}
        </RadioGroup>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={REPORT_NOTE_MAX}
          rows={3}
          placeholder="Keterangan tambahan (opsional)"
          aria-label="Keterangan tambahan"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="button" disabled={send.isPending} onClick={() => send.mutate()}>{send.isPending ? "Mengirim…" : "Kirim laporan"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
