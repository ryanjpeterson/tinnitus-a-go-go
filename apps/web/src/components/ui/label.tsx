import { type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("label", className)} {...rest} />;
}
