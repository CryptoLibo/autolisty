import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
