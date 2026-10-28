import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "@/styles/globals.css";
import { Providers } from "@/components/providers/Providers";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "ASADA",
  description: "ASADA — Ana Savu Dashboard. Social Media Business reads Instagram through the dashboard server; the other areas are under construction.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#eceff3",
  colorScheme: "light",
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
