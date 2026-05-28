import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-base",
          "placeholder:text-text-subtle",
          "focus:border-accent-lime focus:outline-none focus:ring-2 focus:ring-accent-lime/30",
          "disabled:opacity-50",
          className,
        )}
        {...rest}
      />
    );
  },
);
Input.displayName = "Input";
