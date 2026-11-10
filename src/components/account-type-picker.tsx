import { Briefcase, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountType } from "@/lib/market";

const OPTIONS: { value: AccountType; title: string; text: string; Icon: typeof Code2 }[] = [
  { value: "developer", title: "Developer", text: "Pamerkan portofolio, jual karya, buka jasa.", Icon: Code2 },
  { value: "client", title: "Client", text: "Cari developer, beli karya, pesan jasa.", Icon: Briefcase },
];

export function AccountTypePicker({ value, onChange }: { value: AccountType | null; onChange: (v: AccountType) => void }) {
  return (
    <div role="radiogroup" aria-label="Jenis akun" className="grid grid-cols-2 gap-2">
      {OPTIONS.map(({ value: v, title, text, Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-lg border p-3 text-left transition",
            value === v ? "border-primary bg-primary/10 shadow-glow" : "border-border hover:border-primary/50",
          )}
        >
          <Icon className={cn("size-5", value === v ? "text-primary" : "text-muted-foreground")} />
          <span className="mt-2 block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-muted-foreground">{text}</span>
        </button>
      ))}
    </div>
  );
}
