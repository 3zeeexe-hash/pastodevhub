import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
export function SignInCta({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button asChild size="sm" className="mt-3"><Link to="/auth">Masuk</Link></Button>
    </div>
  );
}
