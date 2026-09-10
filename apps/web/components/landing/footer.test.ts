import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getDictionary } from "../../lib/i18n/get-dictionary";
import { LandingFooter } from "./footer";

const render = (props: { signupEnabled: boolean; signedIn: boolean }) =>
  renderToStaticMarkup(
    createElement(LandingFooter, {
      githubUrl: "https://github.com/rementum/rementum",
      dict: getDictionary("en"),
      ...props,
    }),
  );

describe("LandingFooter account column", () => {
  // The landing page keeps the public shell for a signed-in visitor, so the footer must not
  // keep pitching sign-in underneath the header's Dashboard link.
  it("offers the dashboard instead of sign-in links once signed in", () => {
    const html = render({ signupEnabled: true, signedIn: true });
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('href="/auth/login"');
    expect(html).not.toContain('href="/register"');
    // Password reset stays reachable: signing in through it is still valid.
    expect(html).toContain('href="/forgot-password"');
  });

  it("keeps the sign-in and signup links for a visitor", () => {
    const html = render({ signupEnabled: true, signedIn: false });
    expect(html).toContain('href="/auth/login"');
    expect(html).toContain('href="/register"');
    expect(html).not.toContain('href="/dashboard"');
  });

  it("hides signup when the instance has it disabled", () => {
    const html = render({ signupEnabled: false, signedIn: false });
    expect(html).toContain('href="/auth/login"');
    expect(html).not.toContain('href="/register"');
  });

  // The dictionary is the only source of these labels; a missing key would render "undefined".
  it("uses the localized labels", () => {
    const dict = getDictionary("tr");
    const html = renderToStaticMarkup(
      createElement(LandingFooter, {
        githubUrl: "https://github.com/rementum/rementum",
        signupEnabled: true,
        signedIn: true,
        dict,
      }),
    );
    expect(html).toContain(dict.common.dashboard);
    expect(html).not.toContain("undefined");
  });
});
