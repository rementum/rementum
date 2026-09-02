import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";

describe("contentSecurityPolicy", () => {
  it("keeps images, forms, and framing on this origin and allows only Turnstile outside it", () => {
    const policy = contentSecurityPolicy({ development: false });
    const directives = new Map(
      policy.split("; ").map((directive) => {
        const [name, ...values] = directive.split(" ");
        return [name, values];
      }),
    );
    expect(directives.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives.get("form-action")).toEqual(["'self'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://challenges.cloudflare.com",
    ]);
    expect(policy).not.toContain("'unsafe-eval'");
    const thirdParties = policy.match(/https?:\/\/[^\s;]+/g) ?? [];
    expect(new Set(thirdParties)).toEqual(new Set(["https://challenges.cloudflare.com"]));
  });

  it("allows eval and websockets only for the development server", () => {
    const policy = contentSecurityPolicy({ development: true });
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("ws: wss:");
  });
});
