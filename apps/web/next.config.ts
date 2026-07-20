import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const apiOrigin = process.env.STUDIO_API_ORIGIN ?? "http://127.0.0.1:8010";
const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Lean, self-contained server bundle for Cloud Run (#84).
  output: "standalone",
  // Keep tracing rooted on this app, not a parent lockfile.
  outputFileTracingRoot: configDir,
  // Same-origin proxy so the onboarding session cookie is first-party locally.
  async rewrites() {
    return [
      {
        source: "/studio-backend/:path*",
        destination: `${apiOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
