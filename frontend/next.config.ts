import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Repo root also has a package-lock.json (Astro). Keep tracing rooted here.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
