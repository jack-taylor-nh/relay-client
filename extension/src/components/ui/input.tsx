import { forwardRef } from "preact/compat";
import type { JSX } from "preact";
import { cn } from "@/lib/utils";

export interface InputProps extends Omit<JSX.HTMLAttributes<HTMLInputElement>, "ref"> {
  error?: boolean;
  type?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
