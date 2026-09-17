import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const baseEnv = {
  REMENTUM_DATABASE_URL: "postgres://owl:secret@localhost/owl",
  REMENTUM_MASTER_KEY: "master-key",
  REMENTUM_COOKIE_KEYS: "cookie-key-at-least-sixteen-characters",
};

describe("account email configuration", () => {
  it("requires Resend when public signup is enabled", () => {
    expect(() => loadConfig({ ...baseEnv, REMENTUM_ALLOW_SIGNUP: "true" })).toThrow(/Resend/);
  });

  it("accepts a complete Resend configuration", () => {
    const config = loadConfig({
      ...baseEnv,
      REMENTUM_ALLOW_SIGNUP: "true",
      REMENTUM_RESEND_API_KEY: "re_test",
      REMENTUM_MAIL_FROM: "Rementum <rementum@example.test>",
    });
    expect(config.REMENTUM_ALLOW_SIGNUP).toBe(true);
    expect(config.REMENTUM_RESEND_API_KEY).toBe("re_test");
  });
});

describe("turnstile configuration", () => {
  it("is off by default", () => {
    const config = loadConfig({ ...baseEnv, REMENTUM_TURNSTILE_SITE_KEY: "" });
    expect(config.REMENTUM_TURNSTILE_SITE_KEY).toBeUndefined();
    expect(config.REMENTUM_TURNSTILE_SECRET_KEY).toBeUndefined();
  });

  it("refuses a half-configured pair", () => {
    expect(() => loadConfig({ ...baseEnv, REMENTUM_TURNSTILE_SITE_KEY: "0x4AAA-site" })).toThrow(
      /must be configured together/,
    );
    expect(() =>
      loadConfig({ ...baseEnv, REMENTUM_TURNSTILE_SECRET_KEY: "0x4AAA-secret" }),
    ).toThrow(/must be configured together/);
  });

  it("accepts a complete pair", () => {
    const config = loadConfig({
      ...baseEnv,
      REMENTUM_TURNSTILE_SITE_KEY: "0x4AAA-site",
      REMENTUM_TURNSTILE_SECRET_KEY: "0x4AAA-secret",
    });
    expect(config.REMENTUM_TURNSTILE_SITE_KEY).toBe("0x4AAA-site");
    expect(config.REMENTUM_TURNSTILE_SECRET_KEY).toBe("0x4AAA-secret");
  });
});

describe("development identity header", () => {
  it("is accepted outside production", () => {
    expect(loadConfig({ ...baseEnv, REMENTUM_DEV_AUTH: "true" }).REMENTUM_DEV_AUTH).toBe(true);
  });

  it("is rejected in production because it bypasses authentication", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: "production",
        REMENTUM_PUBLIC_URL: "https://rementum.example.test",
        REMENTUM_JWT_JWKS: '{"keys":[]}',
        REMENTUM_DEV_AUTH: "true",
      }),
    ).toThrow(/REMENTUM_DEV_AUTH/);
  });
});

describe("database configuration", () => {
  it("treats a blanked admin URL as not configured", () => {
    expect(
      loadConfig({ ...baseEnv, REMENTUM_DATABASE_ADMIN_URL: "" }).REMENTUM_DATABASE_ADMIN_URL,
    ).toBeUndefined();
    expect(
      loadConfig({ ...baseEnv, REMENTUM_DATABASE_ADMIN_URL: "postgres://postgres@db/owl" })
        .REMENTUM_DATABASE_ADMIN_URL,
    ).toBe("postgres://postgres@db/owl");
  });
});

describe("reverse proxy configuration", () => {
  it("trusts only private proxies by default so public clients cannot forge an address", () => {
    expect(loadConfig(baseEnv).REMENTUM_TRUSTED_PROXIES).toBe("loopback,uniquelocal");
  });

  it("accepts an explicit proxy list and an empty value for direct exposure", () => {
    expect(
      loadConfig({ ...baseEnv, REMENTUM_TRUSTED_PROXIES: "10.4.0.7" }).REMENTUM_TRUSTED_PROXIES,
    ).toBe("10.4.0.7");
    expect(loadConfig({ ...baseEnv, REMENTUM_TRUSTED_PROXIES: "" }).REMENTUM_TRUSTED_PROXIES).toBe(
      "",
    );
  });
});
