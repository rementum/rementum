import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const validEnv = {
  REMENTUM_DATABASE_URL: "postgres://owl:secret@localhost/owl",
  REMENTUM_MASTER_KEY: "master-key",
  REMENTUM_COOKIE_KEYS: "cookie-key-at-least-sixteen-characters",
  REMENTUM_LLM_ENABLED: "true",
  REMENTUM_LLM_BASE_URL: "https://llm.example.test/v1",
  REMENTUM_LLM_MODEL: "summary-model",
};

describe("LLM configuration", () => {
  it("requires explicit enablement", () => {
    expect(() => loadConfig({ ...validEnv, REMENTUM_LLM_ENABLED: "false" })).toThrow(
      /REMENTUM_LLM_ENABLED/,
    );
  });

  it("requires an API base URL and model", () => {
    const { REMENTUM_LLM_MODEL: _model, ...withoutModel } = validEnv;
    expect(() => loadConfig(withoutModel)).toThrow(/REMENTUM_LLM_MODEL/);
    expect(() => loadConfig({ ...validEnv, REMENTUM_LLM_BASE_URL: "not-a-url" })).toThrow(
      /REMENTUM_LLM_BASE_URL/,
    );
  });

  it("allows an unauthenticated compatible endpoint and applies safe defaults", () => {
    const config = loadConfig({
      ...validEnv,
      REMENTUM_LLM_API_KEY: "",
      REMENTUM_LLM_REASONING_EFFORT: "",
    });
    expect(config.REMENTUM_LLM_ENABLED).toBe(true);
    expect(config.REMENTUM_LLM_API_KEY).toBeUndefined();
    expect(config.REMENTUM_LLM_REASONING_EFFORT).toBeUndefined();
    expect(config.REMENTUM_LLM_TIMEOUT_MS).toBe(45_000);
    expect(config.REMENTUM_LLM_MAX_INPUT_CHARS).toBe(24_000);
    expect(config.REMENTUM_LLM_CONCURRENCY).toBe(4);
  });

  it("accepts a known reasoning effort and rejects unknown values", () => {
    const config = loadConfig({ ...validEnv, REMENTUM_LLM_REASONING_EFFORT: "high" });
    expect(config.REMENTUM_LLM_REASONING_EFFORT).toBe("high");
    expect(() => loadConfig({ ...validEnv, REMENTUM_LLM_REASONING_EFFORT: "maximum" })).toThrow(
      /REMENTUM_LLM_REASONING_EFFORT/,
    );
  });
});

describe("account email configuration", () => {
  it("requires Resend when public signup is enabled", () => {
    expect(() => loadConfig({ ...validEnv, REMENTUM_ALLOW_SIGNUP: "true" })).toThrow(/Resend/);
  });

  it("accepts a complete Resend configuration", () => {
    const config = loadConfig({
      ...validEnv,
      REMENTUM_ALLOW_SIGNUP: "true",
      REMENTUM_RESEND_API_KEY: "re_test",
      REMENTUM_MAIL_FROM: "Rementum <rementum@example.test>",
    });
    expect(config.REMENTUM_ALLOW_SIGNUP).toBe(true);
    expect(config.REMENTUM_RESEND_API_KEY).toBe("re_test");
  });
});
