import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The card iframe (sandbox, no allow-same-origin) has an opaque
        // "null" origin, so KaTeX's font requests need an explicit CORS
        // allow — same-origin isn't enough when the requester has no origin.
        source: "/katex/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
