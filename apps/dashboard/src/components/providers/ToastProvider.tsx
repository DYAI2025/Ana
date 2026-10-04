"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Toast.module.css";

interface ToastValue {
  notify: (message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);
const TOAST_MS = 3200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast((current) => ({ id: (current?.id ?? 0) + 1, message }));
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className={styles.root} role="status" aria-live="polite" aria-atomic="true">
        {toast ? (
          <div key={toast.id} className={`glass ${styles.toast}`} data-testid="toast">
            {toast.message}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside <ToastProvider>");
  return value;
}
