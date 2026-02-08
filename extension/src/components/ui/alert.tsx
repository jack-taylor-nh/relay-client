import { type ComponentChildren } from "preact";
import type { JSX } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default:
          "bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]",
        destructive:
          "bg-[var(--color-error-subtle)] border-[var(--color-error)] text-[var(--color-error)] [&>svg]:text-[var(--color-error)]",
        warning:
          "bg-[var(--color-warning-subtle)] border-[var(--color-warning)] text-[hsl(var(--foreground))] [&>svg]:text-[var(--color-warning)]",
        success:
          "bg-[var(--color-success-subtle)] border-[var(--color-success)] text-[hsl(var(--foreground))] [&>svg]:text-[var(--color-success)]",
        info:
          "bg-[var(--color-info-subtle)] border-[var(--color-info)] text-[hsl(var(--foreground))] [&>svg]:text-[var(--color-info)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const alertIcons = {
  default: Info,
  info: Info,
  warning: AlertTriangle,
  destructive: XCircle,
  success: CheckCircle2,
};

export interface AlertProps
  extends JSX.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  children?: ComponentChildren;
  showIcon?: boolean;
}

function Alert({ className, variant, children, showIcon = true, ...props }: AlertProps) {
  const Icon = alertIcons[variant || "default"];
  
  return (
    <div
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {showIcon && <Icon className="h-4 w-4" />}
      {children}
    </div>
  );
}

function AlertTitle({
  className,
  ...props
}: JSX.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      className={cn("mb-1 font-medium leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-sm [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
