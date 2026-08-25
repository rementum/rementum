import { z } from "zod";

const configSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    OWL_PUBLIC_URL: z.url().default("http://localhost:8787"),
    OWL_DATABASE_URL: z.string().min(1),
    OWL_DATABASE_ADMIN_URL: z.string().min(1).optional(),
    OWL_MASTER_KEY: z.string().min(1),
    OWL_COOKIE_KEYS: z.string().min(16),
    OWL_JWT_JWKS: z.string().optional(),
    OWL_BLOB_DIR: z.string().default("./data/blobs"),
    OWL_EXPORT_DIR: z.string().default("./data/exports"),
    OWL_EMBEDDINGS_URL: z.url().default("http://localhost:8790"),
    OWL_LLM_ENABLED: z.literal("true").transform(() => true),
    OWL_LLM_BASE_URL: z.url(),
    OWL_LLM_MODEL: z.string().min(1),
    OWL_LLM_API_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    OWL_LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(45_000),
    OWL_LLM_MAX_INPUT_CHARS: z.coerce.number().int().min(8000).max(200_000).default(24_000),
    OWL_LLM_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
    OWL_ALLOW_SIGNUP: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    OWL_DEV_AUTH: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    OWL_LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.OWL_JWT_JWKS) {
      ctx.addIssue({
        code: "custom",
        path: ["OWL_JWT_JWKS"],
        message: "A persistent signing JWKS is required in production",
      });
    }
    if (value.NODE_ENV === "production" && !value.OWL_PUBLIC_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["OWL_PUBLIC_URL"],
        message: "Production OAuth requires HTTPS",
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
