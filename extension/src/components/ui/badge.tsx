import { type ComponentChildren } from "preact";
import type { JSX } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
        secondary:
          "border-transparent bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]",
        destructive:
          "border-transparent bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]",
        outline: "text-[hsl(var(--foreground))]",
        success:
          "border-transparent bg-[var(--color-success-subtle)] text-[var(--color-success)]",
        warning:
          "border-transparent bg-[var(--color-warning-subtle)] text-[var(--color-warning)]",
        accent:
          "border-transparent bg-[hsl(var(--accent))/0.1] text-[hsl(var(--accent))]",
        // Edge type badges
        native:
          "border-transparent bg-[var(--color-edge-native-subtle)] text-[var(--color-edge-native)]",
        email:
          "border-transparent bg-[var(--color-edge-email-subtle)] text-[var(--color-edge-email)]",
        discord:
          "border-transparent bg-[var(--color-edge-discord-subtle)] text-[var(--color-edge-discord)]",
        webhook:
          "border-transparent bg-[var(--color-edge-webhook-subtle)] text-[var(--color-edge-webhook)]",
        "contact-link":
          "border-transparent bg-[var(--color-edge-contact-link-subtle)] text-[var(--color-edge-contact-link)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends JSX.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  children?: ComponentChildren;
}

function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
