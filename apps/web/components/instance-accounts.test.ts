import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InstanceUsersPage } from "../lib/admin";
import { InstanceAccounts } from "./instance-accounts";

describe("InstanceAccounts", () => {
  it("lists accounts with their state and escapes what people typed", () => {
    const html = renderToStaticMarkup(
      createElement(InstanceAccounts, { page: page(), pageNumber: 1 }),
    );

    expect(html).toContain('value="&lt;script&gt;"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("Instance owner");
    expect(html).toContain("active");
    expect(html).toContain("unverified");
    expect(html).toContain("disabled");
    expect(html).toContain("owner@example.test");
    expect(html).toContain("No activity yet");
    expect(html).toContain("&lt;b&gt;Ada&lt;/b&gt;");
    expect(html).not.toContain("<b>Ada</b>");
    // Three accounts fit on one page, so no pager is offered.
    expect(html).not.toContain("Next →");
  });

  it("explains an empty search and offers to clear it", () => {
    const html = renderToStaticMarkup(
      createElement(InstanceAccounts, {
        page: { items: [], total: 0, query: "nobody", limit: 50, offset: 0 },
        pageNumber: 1,
      }),
    );
    expect(html).toContain("No account matches this search.");
    expect(html).toContain('href="/admin/accounts"');
  });
});

function page(): InstanceUsersPage {
  return {
    query: "<script>",
    limit: 50,
    offset: 0,
    total: 3,
    items: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        email: "owner@example.test",
        displayName: "Owner",
        systemOwner: true,
        emailVerifiedAt: "2026-08-01T00:00:00.000Z",
        disabledAt: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        teams: 2,
        lastActiveAt: "2026-09-02T11:00:00.000Z",
        mcpConnections: 3,
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        email: "ada@example.test",
        displayName: "<b>Ada</b>",
        systemOwner: false,
        emailVerifiedAt: null,
        disabledAt: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        teams: 1,
        lastActiveAt: null,
        mcpConnections: 0,
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        email: "gone@example.test",
        displayName: "",
        systemOwner: false,
        emailVerifiedAt: "2026-08-10T00:00:00.000Z",
        disabledAt: "2026-08-20T00:00:00.000Z",
        createdAt: "2026-08-10T00:00:00.000Z",
        teams: 0,
        lastActiveAt: "2026-08-19T00:00:00.000Z",
        mcpConnections: 0,
      },
    ],
  };
}
