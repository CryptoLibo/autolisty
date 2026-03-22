import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    proxyClientMaxBodySize: "50mb",
    middlewareClientMaxBodySize: "50mb",
  } as any,
};

export default nextConfig;
