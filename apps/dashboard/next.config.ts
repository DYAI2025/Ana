import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // LIVE-01: a self-contained server (server.js + traced node_modules) for the container image
  output: "standalone",
  // the floating dev badge sits on top of the prototype UI during human testing
  devIndicators: false,
};

export default nextConfig;
