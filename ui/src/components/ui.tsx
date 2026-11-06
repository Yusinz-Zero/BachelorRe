import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

// --- Button ---
type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** fully rounded (pill) shape — plain clsx can't override the base radius */
  pill?: boolean;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:brightness-110 shadow-[0_0_24px_-6px_rgba(254,220,40,0.55)] disabled:shadow-none",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
  outline: "border border-border bg-transparent hover:bg-accent",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-14 px-8 text-base gap-2",
  icon: "size-9",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", pill, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap tracking-wide transition-all duration-200 ",
        pill ? "rounded-full" : "rounded-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";

// --- Card ---
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-border/70 bg-card/55 p-5 backdrop-blur-md", className)}
      {...props}
    />
  );
}

export function CardHead({
  title,
  right,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h3 className="text-sm font-semibold tracking-wide text-foreground">{title}</h3>
      {right}
    </div>
  );
}

// --- Badge ---
type BadgeTone = "ok" | "warn" | "bad" | "idle" | "gold";
const tones: Record<BadgeTone, string> = {
  ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  bad: "bg-red-500/15 text-red-300 border-red-500/30",
  idle: "bg-muted text-muted-foreground border-border",
  gold: "bg-primary/15 text-primary border-primary/30",
};

export function Badge({ tone = "idle", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// --- Switch ---
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary" : "bg-secondary",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      <span
        className={cn(
          "inline-block size-4 transform rounded-full bg-background transition-transform duration-200",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
      {label && <span className="sr-only">{label}</span>}
    </button>
  );
}

// --- KV row ---
export function KV({ label, value, ok }: { label: string; value: ReactNode; ok?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("truncate text-right font-medium tabular-nums", ok === undefined ? "text-foreground" : ok ? "text-emerald-300" : "text-red-300")}>
        {value}
      </span>
    </div>
  );
}

// --- Field (label + control) ---
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between text-[13px] text-muted-foreground">
        <span>{label}</span>
        {hint && <span className="text-[11px]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "h-10 w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

// --- Spinner ---
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-muted-foreground", className)} />;
}
