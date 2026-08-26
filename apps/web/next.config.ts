import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  output: "standalone",
  poweredByHeader: false,
  // /docs renders repo-root docs/*.md at request time; force them into the standalone output.
  outputFileTracingIncludes: {
    "/docs/[[...slug]]": ["../../docs/*.md"],
  },
};

export default config;
