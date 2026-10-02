import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The TypeScript compiler is used at runtime for syntax-aware parsing; load it from node_modules
  // instead of bundling it into every server chunk.
  serverExternalPackages: ["typescript"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
