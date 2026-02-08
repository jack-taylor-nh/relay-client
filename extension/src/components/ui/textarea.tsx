import { forwardRef } from "preact/compat";
import type { JSX } from "preact";
import { cn } from "@/lib/utils";

export interface TextareaProps extends Omit<JSX.HTMLAttributes<HTMLTextAreaElement>, "ref"> {
  error?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
          error && "border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
