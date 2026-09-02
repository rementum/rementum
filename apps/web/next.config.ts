import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./lib/csp";

const config: NextConfig = {
  agentRules: false,
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy({ development: process.env.NODE_ENV !== "production" }),
          },
        ],
      },
    ];
  },
};

export default config;
