import { BadgeCheck, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { TIER_META, VERIFIED_TIERS, type VerifiedTier } from "@/lib/verification-tier";

/** Pilihan centang untuk satu akun: biru, hijau, merah, atau cabut. Dipakai di menu aksi daftar pengguna dan panel detail. */
export function VerifiedTierItems({ current, onPick }: { current: VerifiedTier | null; onPick: (tier: VerifiedTier | null) => void }) {
  return (
    <>
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Centang verifikasi</DropdownMenuLabel>
      {VERIFIED_TIERS.map((t) => {
        const meta = TIER_META[t];
        return (
          <DropdownMenuItem key={t} onClick={() => { if (t !== current) onPick(t); }} className="items-start gap-2">
            <BadgeCheck className={cn("mt-0.5 size-4 shrink-0 text-white", meta.fill)} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Centang {meta.colorName} · {meta.label}</span>
              <span className="block text-xs text-muted-foreground">{meta.hint}</span>
            </span>
            {t === current && <Check className="mt-0.5 size-4 shrink-0" aria-label="Sedang dipakai" />}
          </DropdownMenuItem>
        );
      })}
      {current && (
        <DropdownMenuItem onClick={() => onPick(null)} className="text-destructive focus:text-destructive">
          <X /> Cabut centang
        </DropdownMenuItem>
      )}
    </>
  );
}

/** Tombol dengan menu pilihan centang, untuk panel detail akun. */
export function VerifiedTierButton({ current, disabled, onPick }: { current: VerifiedTier | null; disabled?: boolean | undefined; onPick: (tier: VerifiedTier | null) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <BadgeCheck className={cn(current && ["text-white", TIER_META[current].fill])} />
          {current ? `Centang ${TIER_META[current].colorName}` : "Beri centang"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <VerifiedTierItems current={current} onPick={onPick} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
