import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  workspaceContext: vi.fn(),
  preferences: new Map<string, { value: string }>(),
}));
vi.mock("../lib/api", () => ({ api: mocks.api, workspaceContext: mocks.workspaceContext }));
vi.mock("next/headers", () => ({ cookies: async () => mocks.preferences }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { getDictionary } from "../lib/i18n/get-dictionary";
import type { Locale } from "../lib/i18n/locales";
import { Dashboard } from "./dashboard";

const workspace = {
  id: "workspace-one",
  name: "Engineering",
  mcpUrl: "https://example.test/mcp/workspace/workspace-one",
};
const team = { name: "Example team" };
const brains = Array.from({ length: 3 }, (_, index) => ({
  id: `brain-${index}`,
  workspaceId: workspace.id,
  slug: `brain-${index}`,
  name: `Knowledge ${index}`,
  description: "A shared set of engineering decisions.",
  updatedAt: "2026-09-01T12:00:00Z",
}));

beforeEach(() => {
  mocks.preferences.clear();
  mocks.workspaceContext.mockResolvedValue({ activeTeam: team, activeWorkspace: workspace });
  mocks.api.mockReset();
  mocks.api.mockImplementation(async (path: string) => {
    if (path.includes("article-counts"))
      return [
        { brainId: "brain-0", articleCount: 17, latestArticleUpdatedAt: "2026-09-02T12:00:00Z" },
      ];
    if (path.endsWith("review-queue")) return { items: [], counts: [] };
    const url = new URL(path, "https://example.test");
    if (url.searchParams.has("shared")) return { items: [], total: 0 };
    return { items: brains, total: brains.length };
  });
});

const render = async (locale: Locale) =>
  renderToStaticMarkup(await Dashboard({ locale, dict: getDictionary(locale) }));

describe("Dashboard locales", () => {
  it("renders English by default", async () => {
    const html = await render("en");
    expect(html).toContain("Overview");
    expect(html).toContain("Awaiting review");
    expect(html).toContain("Needs review");
  });

  it("renders the same dashboard in Chinese", async () => {
    const html = await render("zh");
    expect(html).toContain("概览");
    expect(html).toContain("待审核");
    expect(html).toContain("Brain");
    expect(html).not.toContain("Awaiting review");
  });

  it("renders the same dashboard in Turkish", async () => {
    const html = await render("tr");
    expect(html).toContain("Genel bakış");
    expect(html).toContain("İnceleme bekliyor");
    expect(html).not.toContain("Awaiting review");
  });
});
