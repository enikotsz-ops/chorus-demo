import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastMsg = { text: string; action?: { label: string; run: () => void } };
const Ctx = createContext<(t: ToastMsg | string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const timer = useRef<number>();

  const show = useCallback((t: ToastMsg | string) => {
    window.clearTimeout(timer.current);
    setToast(typeof t === "string" ? { text: t } : t);
    timer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
