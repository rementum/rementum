import { z } from "zod";

const configSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    REMENTUM_PUBLIC_URL: z.url().default("http://localhost:8787"),
    REMENTUM_DATABASE_URL: z.string().min(1),
    REMENTUM_DATABASE_ADMIN_URL: z.string().min(1).optional(),
    REMENTUM_MASTER_KEY: z.string().min(1),
    REMENTUM_COOKIE_KEYS: z.string().min(16),
    REMENTUM_JWT_JWKS: z.string().optional(),
    REMENTUM_BLOB_DIR: z.string().default("./data/blobs"),
    REMENTUM_EXPORT_DIR: z.string().default("./data/exports"),
    REMENTUM_EMBEDDINGS_URL: z.url().default("http://localhost:8790"),
    REMENTUM_LLM_ENABLED: z.literal("true").transform(() => true),
    REMENTUM_LLM_BASE_URL: z.url(),
    REMENTUM_LLM_MODEL: z.string().min(1),
    REMENTUM_LLM_API_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    REMENTUM_LLM_REASONING_EFFORT: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.enum(["none", "minimal", "low", "medium", "high"]).optional(),
    ),
    REMENTUM_LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(45_000),
    REMENTUM_LLM_MAX_INPUT_CHARS: z.coerce.number().int().min(8000).max(200_000).default(24_000),
    REMENTUM_LLM_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
    REMENTUM_RESEND_API_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    REMENTUM_MAIL_FROM: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(3).optional(),
    ),
    REMENTUM_ALLOW_SIGNUP: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    REMENTUM_DEV_AUTH: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    REMENTUM_LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.REMENTUM_JWT_JWKS) {
      ctx.addIssue({
        code: "custom",
        path: ["REMENTUM_JWT_JWKS"],
        message: "A persistent signing JWKS is required in production",
      });
    }
    if (value.NODE_ENV === "production" && !value.REMENTUM_PUBLIC_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["REMENTUM_PUBLIC_URL"],
        message: "Production OAuth requires HTTPS",
      });
    }
    if (Boolean(value.REMENTUM_RESEND_API_KEY) !== Boolean(value.REMENTUM_MAIL_FROM)) {
      ctx.addIssue({
        code: "custom",
        path: ["REMENTUM_RESEND_API_KEY"],
        message: "REMENTUM_RESEND_API_KEY and REMENTUM_MAIL_FROM must be configured together",
      });
    }
    if (value.REMENTUM_ALLOW_SIGNUP && !value.REMENTUM_RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["REMENTUM_ALLOW_SIGNUP"],
        message: "Public signup requires Resend email delivery",
      });
    }
  });

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
