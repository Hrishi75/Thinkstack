import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/util";

/**
 * Shared primitives that define the app's visual language: one button scale,
 * one kbd chip, one filter-pill row, one empty state. Views compose these so
 * density and chrome stay identical everywhere.
 */

type ButtonVariant = "primary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent font-medium text-white shadow-soft hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40",
  ghost:
    "text-muted hover:bg-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-40",
  outline:
    "border border-border bg-bg text-muted hover:border-accent/50 hover:text-text disabled:cursor-not-allowed disabled:opacity-40",
  danger:
    "bg-red-500/10 font-medium text-red-500 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-6 gap-1 rounded-md px-2 text-[11.5px]",
  md: "h-7 gap-1.5 rounded-md px-2.5 text-[12.5px]",
  lg: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
};

export function Button({
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center transition",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}

export function IconButton({
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "rounded-md p-1.5 text-muted transition hover:bg-elevated hover:text-text",
        className
      )}
      {...props}
    />
  );
}

export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "rounded border border-border/70 bg-bg px-1 py-0.5 text-[10px] font-medium leading-none text-muted",
        className
      )}
    >
      {children}
    </kbd>
  );
}

/** One row of exclusive filter pills, with optional per-pill counts. */
export function PillTabs<K extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: { key: K; label: string; count?: number }[];
  value: K | null;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {items.map(({ key, label, count }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] transition",
            value === key
              ? "bg-elevated font-medium text-text"
              : "text-muted hover:bg-elevated/60 hover:text-text"
          )}
        >
          {label}
          {count !== undefined && (
            <span className="text-[10.5px] tabular-nums opacity-60">{count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Centered empty state: icon, one-line title, optional hint and actions. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center",
        className
      )}
    >
      <Icon size={26} strokeWidth={1.5} className="mb-1 text-muted/50" />
      <p className="text-[13.5px] font-medium text-text">{title}</p>
      {hint && <p className="max-w-xs text-[12.5px] text-muted">{hint}</p>}
      {children && <div className="mt-2.5 flex items-center gap-1.5">{children}</div>}
    </div>
  );
}
