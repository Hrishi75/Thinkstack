import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useUI } from "../store/ui";

/** Bottom-center transient notification with an optional single action (Undo etc.). */
export default function Toast() {
  const toast = useUI((s) => s.toast);
  const dismiss = useUI((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, 5000);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center"
        >
          <div className="pointer-events-auto flex items-center gap-1 rounded-lg bg-text px-3 py-2 text-[13px] text-bg shadow-pop">
            <span className="pr-1">{toast.message}</span>
            {toast.actionLabel && toast.onAction && (
              <button
                onClick={() => {
                  toast.onAction?.();
                  dismiss();
                }}
                className="rounded-md px-2 py-0.5 font-medium text-accent transition hover:bg-bg/10"
              >
                {toast.actionLabel}
              </button>
            )}
            <button
              onClick={dismiss}
              className="rounded-md p-1 opacity-60 transition hover:opacity-100"
              title="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
