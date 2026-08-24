import { describe, expect, it } from "vitest";
import { normalizeOidcAdapterPayload } from "./auth.js";

describe("normalizeOidcAdapterPayload", () => {
  it("keeps offline_access on refresh tokens for clients that resend granted scopes", () => {
    expect(
      normalizeOidcAdapterPayload("RefreshToken", {
        scope: "openid brain:read brain:write",
      }),
    ).toEqual({ scope: "openid brain:read brain:write offline_access" });
  });

  it("does not change other token models or duplicate the scope", () => {
    const refresh = { scope: "brain:read offline_access" };
    const access = { scope: "brain:read" };
    expect(normalizeOidcAdapterPayload("RefreshToken", refresh)).toBe(refresh);
    expect(normalizeOidcAdapterPayload("AccessToken", access)).toBe(access);
  });
});
