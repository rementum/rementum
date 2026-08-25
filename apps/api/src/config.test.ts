import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const validEnv = {
  OWL_DATABASE_URL: "postgres://owl:secret@localhost/owl",
  OWL_MASTER_KEY: "master-key",
  OWL_COOKIE_KEYS: "cookie-key-at-least-sixteen-characters",
  OWL_LLM_ENABLED: "true",
  OWL_LLM_BASE_URL: "https://llm.example.test/v1",
  OWL_LLM_MODEL: "summary-model",
};

describe("LLM configuration", () => {
  it("requires explicit enablement", () => {
    expect(() => loadConfig({ ...validEnv, OWL_LLM_ENABLED: "false" })).toThrow(/OWL_LLM_ENABLED/);
  });

  it("requires an API base URL and model", () => {
    const { OWL_LLM_MODEL: _model, ...withoutModel } = validEnv;
    expect(() => loadConfig(withoutModel)).toThrow(/OWL_LLM_MODEL/);
    expect(() => loadConfig({ ...validEnv, OWL_LLM_BASE_URL: "not-a-url" })).toThrow(
      /OWL_LLM_BASE_URL/,
    );
  });

  it("allows an unauthenticated compatible endpoint and applies safe defaults", () => {
    const config = loadConfig({ ...validEnv, OWL_LLM_API_KEY: "", OWL_LLM_REASONING_EFFORT: "" });
    expect(config.OWL_LLM_ENABLED).toBe(true);
    expect(config.OWL_LLM_API_KEY).toBeUndefined();
    expect(config.OWL_LLM_REASONING_EFFORT).toBeUndefined();
    expect(config.OWL_LLM_TIMEOUT_MS).toBe(45_000);
    expect(config.OWL_LLM_MAX_INPUT_CHARS).toBe(24_000);
    expect(config.OWL_LLM_CONCURRENCY).toBe(4);
  });

  it("accepts a known reasoning effort and rejects unknown values", () => {
    const config = loadConfig({ ...validEnv, OWL_LLM_REASONING_EFFORT: "high" });
    expect(config.OWL_LLM_REASONING_EFFORT).toBe("high");
    expect(() => loadConfig({ ...validEnv, OWL_LLM_REASONING_EFFORT: "maximum" })).toThrow(
      /OWL_LLM_REASONING_EFFORT/,
    );
  });
});

describe("account email configuration", () => {
  it("requires Resend when public signup is enabled", () => {
    expect(() => loadConfig({ ...validEnv, OWL_ALLOW_SIGNUP: "true" })).toThrow(/Resend/);
  });

  it("accepts a complete Resend configuration", () => {
    const config = loadConfig({
      ...validEnv,
      OWL_ALLOW_SIGNUP: "true",
      OWL_RESEND_API_KEY: "re_test",
      OWL_MAIL_FROM: "Owl Memory <owl@example.test>",
    });
    expect(config.OWL_ALLOW_SIGNUP).toBe(true);
    expect(config.OWL_RESEND_API_KEY).toBe("re_test");
  });
});
