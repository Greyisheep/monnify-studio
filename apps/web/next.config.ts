import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lean, self-contained server bundle for Cloud Run (#84).
  output: "standalone",
};

export default nextConfig;
