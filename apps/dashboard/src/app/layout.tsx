import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "@/styles/globals.css";
import { Providers } from "@/components/providers/Providers";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "ANA LUMEN",
  description: "ANA LUMEN: Board and Backlog are a projection of Jira; the other modules are local prototype data.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#332c32",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
