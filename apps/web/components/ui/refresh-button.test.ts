import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RefreshButton } from "./refresh-button";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("RefreshButton", () => {
  it("renders an idle, enabled button with the given label", () => {
    const html = renderToStaticMarkup(createElement(RefreshButton, { label: "Refresh analytics" }));

    expect(html).toContain('type="button"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain("Refresh analytics");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("Refreshing");
  });
});
