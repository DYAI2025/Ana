import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // the floating dev badge sits on top of the prototype UI during human testing
  devIndicators: false,
};

export default nextConfig;
