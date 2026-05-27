/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastInput {
  type?: ToastType;
  title: string;
  message?: string;
  durationMs?: number;
}

interface ToastItem extends Required<Pick<ToastInput, "type" | "title">> {
  id: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => void;
}

const ToastCtx = createContext<ToastContextValue | null>(null);

function iconFor(type: ToastType) {
  if (type === "success") return <CheckCircle2 size={18} />;
  if (type === "error") return <AlertCircle size={18} />;
  return <Info size={18} />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type = "success", title, message, durationMs = 3200 }: ToastInput) => {
      const id =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      setToasts((current) => [...current.slice(-3), { id, type, title, message }]);
      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="app-toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`app-toast ${toast.type}`}>
            <span className="app-toast-icon">{iconFor(toast.type)}</span>
            <span className="app-toast-copy">
              <strong>{toast.title}</strong>
              {toast.message && <small>{toast.message}</small>}
            </span>
            <button
              type="button"
              className="app-toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
