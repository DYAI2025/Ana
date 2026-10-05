"use client";

import type { ReactNode } from "react";
import { WorkProvider } from "@/features/work/WorkProvider";
import { I18nProvider } from "./I18nProvider";
import { PrototypeProvider } from "./PrototypeProvider";
import { ToastProvider } from "./ToastProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <WorkProvider>
          <PrototypeProvider>{children}</PrototypeProvider>
        </WorkProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
