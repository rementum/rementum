import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signedIn: true,
  surface: "landing",
  language: "tr",
  context: vi.fn(),
  cookieLocale: undefined as string | undefined,
}));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "font" }) }));
vi.mock("next/headers", () => ({
  cookies: async () =>
    new Map(mocks.cookieLocale ? [["rementum_locale", { value: mocks.cookieLocale }]] : []),
  headers: async () =>
    new Headers({
      "x-rementum-surface": mocks.surface,
      "x-rementum-locale": mocks.language,
      "accept-language": mocks.language,
    }),
}));
vi.mock("../lib/api", () => ({
  sessionInfo: async () => ({ authenticated: mocks.signedIn, systemOwner: false }),
  workspaceContext: mocks.context,
  publicAuthConfig: async () => ({ signupEnabled: true }),
}));
vi.mock("../components/app-navigation", () => ({
  AppNavigation: () => createElement("nav", { "data-app-nav": true }),
}));
vi.mock("../components/public-nav", () => ({
  PublicNav: ({ signedIn }: { signedIn: boolean }) =>
    createElement("nav", { "data-public-nav": true, "data-signed-in": signedIn }),
}));

import RootLayout from "./layout";

beforeEach(() => {
  mocks.signedIn = true;
  mocks.surface = "landing";
  mocks.language = "tr";
  mocks.cookieLocale = undefined;
  mocks.context.mockReset().mockResolvedValue({ teams: [], workspaces: [] });
});

describe("root shell", () => {
  it("keeps the English marketing shell aligned with the route despite a translated cookie", async () => {
    mocks.language = "en";
    mocks.cookieLocale = "tr";
    expect(renderToStaticMarkup(await RootLayout({ children: "Home" }))).toContain('lang="en"');
  });
  it("keeps signed-in marketing public without fetching private workspace data", async () => {
    const html = renderToStaticMarkup(await RootLayout({ children: "Home" }));
    expect(html).toContain('lang="tr"');
    expect(html).toContain('data-public-nav="true"');
    expect(html).toContain('data-signed-in="true"');
    expect(html).not.toContain("data-app-nav");
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("renders app navigation for an authenticated dashboard", async () => {
    mocks.surface = "app";
    const html = renderToStaticMarkup(await RootLayout({ children: "Dashboard" }));
    expect(html).toContain('data-app-nav="true"');
    expect(mocks.context).toHaveBeenCalledOnce();
  });
  it("keeps signed-out pages in the public shell", async () => {
    mocks.signedIn = false;
    mocks.surface = "app";
    expect(renderToStaticMarkup(await RootLayout({ children: "Sign in" }))).toContain(
      'data-signed-in="false"',
    );
  });
});
