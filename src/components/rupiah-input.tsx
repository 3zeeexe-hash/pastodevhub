import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatRupiahInput, rupiahDigits } from "@/lib/rupiah";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  /** Digit saja ("1500000"), bukan teks berformat. */
  value: string;
  onValueChange: (digits: string) => void;
};

/** Isian nominal dengan tampilan "Rp 1.500.000". Nilai yang dilaporkan selalu digit saja. */
export const RupiahInput = React.forwardRef<HTMLInputElement, Props>(({ value, onValueChange, placeholder, ...rest }, ref) => (
  <Input
    ref={ref}
    inputMode="numeric"
    autoComplete="off"
    value={formatRupiahInput(value)}
    onChange={(e) => onValueChange(rupiahDigits(e.target.value))}
    placeholder={placeholder ?? "Rp 0"}
    {...rest}
  />
));
RupiahInput.displayName = "RupiahInput";
