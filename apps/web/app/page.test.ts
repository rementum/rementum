import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => new Map(),
  headers: async () => new Headers({ "accept-language": "tr" }),
}));
vi.mock("../lib/api", () => ({
  hasSession: async () => true,
  publicAuthConfig: async () => ({ signupEnabled: true }),
}));

import { LandingPage } from "../components/landing-page";
import { landingMetadata } from "../lib/landing-metadata";

describe("homepage session and locale", () => {
  it("uses the route locale for both page content and metadata", async () => {
    const html = renderToStaticMarkup(await LandingPage({ locale: "tr" }));
    expect(html).toContain("daha iyi bir hafızaya ihtiyacı var");
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('href="/auth/login"');
    expect(html).not.toContain('href="/register"');
    expect(landingMetadata("tr").openGraph).toMatchObject({ locale: "tr_TR" });
  });
});
