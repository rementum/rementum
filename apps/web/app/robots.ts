import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

// The landing page and docs are indexable; everything else is either behind authentication or an
// API/MCP surface, so it stays out of search results.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/activity",
        "/articles/",
        "/brains/",
        "/connections",
        "/dashboard",
        "/tasks/",
        "/teams",
        "/workspaces/",
        "/writes/",
        "/bridge/",
        "/auth/",
        "/invite/",
        "/team-invite/",
        "/register",
        "/resend-verification",
        "/reset-password",
        "/forgot-password",
        "/verify-email",
        "/api/",
        "/mcp/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
