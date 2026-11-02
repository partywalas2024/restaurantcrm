import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // Avoid picking C:\Users\rambh\package-lock.json as the Turbopack root.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
