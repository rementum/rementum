import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDictionary, template } from "../lib/i18n/get-dictionary";
import { TeamHeader } from "./team-management";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const strings = getDictionary("en").teams;

describe("TeamHeader", () => {
  it("renders the team name and kicker and allows rename for owners", () => {
    const html = renderToStaticMarkup(
      createElement(TeamHeader, {
        strings,
        teamId: "00000000-0000-4000-8000-000000000001",
        name: "Platform Team",
        role: "owner",
      }),
    );
    expect(html).toContain("Platform Team");
    expect(html).toContain(template(strings.teamKicker, { role: strings.roleOwner }));
    expect(html).toContain(strings.rename);
  });

  it("allows rename for admins", () => {
    const html = renderToStaticMarkup(
      createElement(TeamHeader, {
        strings,
        teamId: "00000000-0000-4000-8000-000000000001",
        name: "Platform Team",
        role: "admin",
      }),
    );
    expect(html).toContain(strings.rename);
  });

  it("does not render rename button for regular members", () => {
    const html = renderToStaticMarkup(
      createElement(TeamHeader, {
        strings,
        teamId: "00000000-0000-4000-8000-000000000001",
        name: "Platform Team",
        role: "member",
      }),
    );
    expect(html).toContain("Platform Team");
    expect(html).not.toContain(strings.rename);
  });
});
