import { useEffect, useState } from "react";
import { cn } from "../lib/util";

/**
 * Two-step destructive button: the first click arms it, the second fires.
 * Arming lapses after a moment (or on blur) so a button left armed by a
 * stray click can't be triggered by the next one.
 */
export default function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className,
}: {
  label: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2500);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      className={cn(
        "rounded-md px-2 py-1 text-[12px] transition",
        armed
          ? "bg-red-500/15 font-medium text-red-500"
          : "text-muted hover:bg-elevated hover:text-red-500",
        className
      )}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
