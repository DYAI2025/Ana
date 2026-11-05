import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // LIVE-01: a self-contained server (server.js + traced node_modules) for the container image
  output: "standalone",
  // the floating dev badge sits on top of the prototype UI during human testing
  devIndicators: false,
  // only the dashboard itself may frame its pages (the office computer frames /kit, ANA-59); no other site can
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }] }];
  },
};

export default nextConfig;
