"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrainProvider } from "@/features/brain/BrainProvider";
import { WorkProvider } from "@/features/work/WorkProvider";
import { I18nProvider } from "./I18nProvider";
import { PrototypeProvider } from "./PrototypeProvider";
import { ToastProvider } from "./ToastProvider";

/** the media kit is a page for brands (ANA-53/59): it loads none of the dashboard's Jira, Brain or prototype data */
export function isKitPath(pathname: string | null): boolean {
  return pathname === "/kit" || Boolean(pathname?.startsWith("/kit/"));
}

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isKitPath(pathname)) {
    return (
      <I18nProvider>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    );
  }
  return (
    <I18nProvider>
      <ToastProvider>
        <WorkProvider>
          <BrainProvider>
            <PrototypeProvider>{children}</PrototypeProvider>
          </BrainProvider>
        </WorkProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
