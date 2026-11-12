import { Check, ChevronDown, Code2, Briefcase, Laptop, Loader2, User } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_INFO, ROLE_ORDER, workspacePath, accountTypeFor, type Role } from "@/lib/roles";
import { useRole } from "@/lib/use-role";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const ROLE_ICON: Record<Role, LucideIcon> = {
  developer: Code2,
  freelancer: Laptop,
  client: Briefcase,
  personal: User,
};

/** Pemilih peran 2×2 untuk daftar akun, prompt pertama kali, dan pengaturan. */
export function RolePicker({ value, onChange }: { value: Role | null; onChange: (r: Role) => void }) {
  return (
    <div role="radiogroup" aria-label="Peran" className="grid grid-cols-2 gap-2">
      {ROLE_ORDER.map((r) => {
        const { title, tagline } = ROLE_INFO[r];
        const Icon = ROLE_ICON[r];
        const on = value === r;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(r)}
            className={cn("rounded-lg border p-3 text-left transition", on ? "border-primary bg-primary/10 shadow-glow" : "border-border hover:border-primary/50")}
          >
            <Icon className={cn("size-5", on ? "text-primary" : "text-muted-foreground")} />
            <span className="mt-2 block text-sm font-semibold">{title}</span>
            <span className="block text-xs text-muted-foreground">{tagline}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Tombol di header untuk berpindah peran tanpa keluar dari akun. */
export function RoleSwitcher() {
  const { role, setRole, switching } = useRole();
  const navigate = useNavigate();
  const Icon = ROLE_ICON[role];

  async function pick(next: Role) {
    if (next === role) return;
    if (await setRole(next)) navigate({ to: workspacePath(accountTypeFor(next)) });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`Peran aktif: ${ROLE_INFO[role].title}. Ganti peran`} disabled={switching}>
          {switching ? <Loader2 className="animate-spin" /> : <Icon className="text-primary" />}
          <span className="hidden md:inline">{ROLE_INFO[role].title}</span>
          <ChevronDown className="hidden size-3.5 opacity-60 md:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-semibold">Pakai Pastodev sebagai</span>
          <span className="block text-xs text-muted-foreground">Satu akun, ganti peran kapan saja.</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ROLE_ORDER.map((r) => {
          const RIcon = ROLE_ICON[r];
          return (
            <DropdownMenuItem key={r} onSelect={() => void pick(r)} className="items-start gap-3 py-2">
              <RIcon className="mt-0.5 size-4 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{ROLE_INFO[r].title}</span>
                <span className="block text-xs text-muted-foreground">{ROLE_INFO[r].tagline}</span>
              </span>
              {r === role && <Check className="mt-0.5 size-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
