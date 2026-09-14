import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "../lib/i18n/get-dictionary";
import { Dashboard } from "./dashboard";

const { api, view } = vi.hoisted(() => ({ api: vi.fn(), view: { value: "card" } }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => (key === "rementum_brains_view" ? { value: view.value } : undefined),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../lib/api", () => ({
  api,
  workspaceContext: async () => ({
    activeTeam: { id: "team", name: "Test team" },
    activeWorkspace: {
      id: "workspace",
      name: "Test workspace",
      mcpUrl: "https://example.test/mcp",
    },
  }),
}));

describe("idle dashboard indicators", () => {
  it.each(["card", "list"])(
    "keeps review information without pulse loops in %s view",
    async (layout) => {
      view.value = layout;
      api.mockImplementation(async (path: string) => {
        if (path.includes("shared=true")) return { items: [], total: 0 };
        if (path.includes("article-counts"))
          return [
            { brainId: "brain", articleCount: 7, latestArticleUpdatedAt: "2026-09-14T00:00:00Z" },
          ];
        if (path.endsWith("review-queue"))
          return {
            items: [
              {
                id: "write",
                brainId: "brain",
                brainName: "Engineering",
                operation: "update",
                title: "Review the convention",
                status: "conflicted",
                changeSummary: "Clarify the convention",
                createdAt: "2026-09-14T00:00:00Z",
              },
            ],
            counts: [{ brainId: "brain", pending: 2, conflicted: 1 }],
          };
        return {
          items: [
            {
              id: "brain",
              workspaceId: "workspace",
              slug: "engineering",
              name: "Engineering",
              description: "Shared conventions",
              updatedAt: "2026-09-14T00:00:00Z",
            },
          ],
          total: 1,
        };
      });

      const html = renderToStaticMarkup(
        await Dashboard({ locale: "en", dict: getDictionary("en") }),
      );
      expect(html).toContain("3 to review");
      expect(html).toContain("Review the convention");
      expect(html).toContain("conflicted");
      expect(html).toContain('class="pui-dot"');
      expect(html).toContain("bg-orange");
      expect(html).not.toContain("animate-pulse-dot");
      expect(html).not.toContain("pui-dot--pulse");
      expect(html).not.toContain("pui-aurora--drift");
    },
  );
});
