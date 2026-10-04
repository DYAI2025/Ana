"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "./I18nProvider";
import { PrototypeProvider } from "./PrototypeProvider";
import { ToastProvider } from "./ToastProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <PrototypeProvider>
        <ToastProvider>{children}</ToastProvider>
      </PrototypeProvider>
    </I18nProvider>
  );
}
