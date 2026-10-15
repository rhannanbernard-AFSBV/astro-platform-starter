import type { NextConfig } from "next";
import path from "path";

const desktopExport = process.env.ALLYANNA_DESKTOP === "1";

const nextConfig: NextConfig = {
  // Repo root also has a package-lock.json (Astro). Keep tracing rooted here.
  outputFileTracingRoot: path.join(__dirname),
  // Windows desktop package: static export consumed by Electron + FastAPI.
  ...(desktopExport
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        // Absolute API calls from the browser to the local backend.
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
