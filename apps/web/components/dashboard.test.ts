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
import { Dashboard } from "./dashboard";

const workspace = {
  id: "workspace-one",
  name: "Engineering",
  mcpUrl: "https://example.test/mcp/workspace/workspace-one",
};
const team = { name: "Example team" };
const brains = Array.from({ length: 13 }, (_, index) => ({
  id: `brain-${index}`,
  workspaceId: workspace.id,
  slug: `brain-${index}`,
  name: `Knowledge ${index}`,
  description: "A shared set of engineering decisions.",
  updatedAt: "2026-09-01T12:00:00Z",
}));
const write = (index: number) => ({
  id: `write-${index}`,
  brainId: "brain-0",
  brainName: "Knowledge 0",
  operation: "update",
  slug: `change-${index}`,
  title: `Proposed change ${index}`,
  status: index === 0 ? "conflicted" : "pending",
  changeSummary: "Clarify a decision.",
  createdAt: "2026-09-01T12:00:00Z",
});

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
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return { items: brains.slice(offset, offset + 12), total: brains.length };
  });
});

const render = async (
  params: { page?: string; sharedPage?: string; locale?: "en" | "zh" | "tr" } = {},
) => {
  const locale = params.locale ?? "en";
  return renderToStaticMarkup(
    await Dashboard({
      page: params.page,
      sharedPage: params.sharedPage,
      locale,
      dict: getDictionary(locale),
    }),
  );
};
const button = (html: string, label: string) =>
  html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0];

describe("Dashboard", () => {
  it("renders each summary count once", async () => {
    const html = await render();
    const header = html.match(/<header[\s\S]*?<\/header>/)?.[0].replace(/<[^>]*>/g, "");
    expect(header).toContain("13 brains");
    expect(header).toContain("17 articles");
    expect(header).not.toContain("13 13");
    expect(header).not.toContain("17 17");
  });

  it("defaults to a brain index, keeps saved views, and puts setup in a closed disclosure", async () => {
    const html = await render();
    expect(button(html, "List view")).toContain('aria-pressed="true"');
    expect(html.indexOf("Your workspace")).toBeLessThan(html.indexOf("Needs review"));
    expect(html).toContain("No staged writes need review.");
    expect(html).toContain("17");
    expect(html).toContain("https://example.test/mcp/workspace/workspace-one");
    expect(html).toMatch(/<details[^>]*>/);
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|[ >])/);

    mocks.preferences.set("rementum_brains_view", { value: "card" });
    expect(button(await render(), "Card view")).toContain('aria-pressed="true"');
    mocks.preferences.set("rementum_brains_view", { value: "invalid" });
    expect(button(await render(), "List view")).toContain('aria-pressed="true"');
  });

  it("uses complete review counts and exposes returned overflow plus full brain queues", async () => {
    const base = mocks.api.getMockImplementation();
    mocks.api.mockImplementation(async (path: string) =>
      path.endsWith("review-queue")
        ? {
            items: Array.from({ length: 8 }, (_, index) => write(index)),
            counts: [{ brainId: "brain-0", pending: 200, conflicted: 3 }],
          }
        : base?.(path),
    );
    const html = await render();
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain("203 to review · 3 conflicted");
    expect(text).toContain("Show 2 more");
    expect(text).toContain("Showing 8 of 203 writes.");
    expect(html).toContain('href="/brains/brain-0/writes"');
    expect(html).toContain('href="/writes/write-7"');
    expect(html.indexOf("Proposed change 0")).toBeLessThan(html.indexOf("Proposed change 1"));
  });

  it("clamps stale page URLs and preserves the other collection's page", async () => {
    const base = mocks.api.getMockImplementation();
    mocks.api.mockImplementation(async (path: string) =>
      path.includes("shared=true") ? { items: [brains[12]], total: 13 } : base?.(path),
    );
    const html = await render({ page: "999", sharedPage: "2" });
    expect(mocks.api).toHaveBeenCalledWith(
      "/api/v1/brains?workspaceId=workspace-one&sort=updated&limit=12&offset=12",
    );
    expect(html).toContain("Knowledge 12");
    expect(html).toContain('href="/dashboard?sharedPage=2"');
    expect(html).toContain('href="/dashboard?page=2"');
  });

  it("keeps shared brains accessible without a workspace", async () => {
    mocks.workspaceContext.mockResolvedValue({ activeTeam: null, activeWorkspace: null });
    const base = mocks.api.getMockImplementation();
    mocks.api.mockImplementation(async (path: string) =>
      path.includes("shared=true") ? { items: [brains[0]], total: 1 } : base?.(path),
    );
    const html = await render();
    expect(html).toContain("No workspace yet.");
    expect(html).toContain("Shared with me");
    expect(html).toContain('href="/brains/brain-0"');
    expect(html).toContain('href="/teams"');
  });

  it("shows setup immediately in an empty workspace", async () => {
    const base = mocks.api.getMockImplementation();
    mocks.api.mockImplementation(async (path: string) =>
      path.startsWith("/api/v1/brains?") ? { items: [], total: 0 } : base?.(path),
    );
    const html = await render();
    expect(html).toContain("No brains yet.");
    expect(html).toContain("Connect Engineering to an agent.");
    expect(html).not.toContain("<details");
  });

  it("renders the full dashboard in Chinese and Turkish without fallback gaps", async () => {
    const base = mocks.api.getMockImplementation();
    mocks.api.mockImplementation(async (path: string) =>
      path.includes("shared=true") ? { items: [brains[0]], total: 1 } : base?.(path),
    );
    const zh = await render({ locale: "zh" });
    expect(zh).toContain("你的工作区");
    expect(zh).toContain("待审核");
    expect(zh).toContain("共享给我");
    expect(zh).toContain("暂无需要审核的暂存写入");
    expect(zh).not.toContain("Your workspace");

    const tr = await render({ locale: "tr" });
    expect(tr).toContain("Çalışma alanınız");
    expect(tr).toContain("İnceleme bekliyor");
    expect(tr).toContain("Benimle paylaşılan");
    expect(tr).not.toContain("Your workspace");
  });
});
