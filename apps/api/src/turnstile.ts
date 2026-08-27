import { DomainError } from "@rementum/core";
import { z } from "zod";
import type { AppConfig } from "./config.js";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * One schema for every guarded route: a drifted copy would make a single form
 * reject tokens the other flows accept.
 */
export const turnstileTokenSchema = z.string().min(1).max(2048).optional();

/**
 * Cloudflare returns 200 with `{ success: false }` for a failed challenge, so only
 * transport-level faults (network, timeout, non-200) need the explicit fail-closed branch
 * here: an unreachable verifier must not wave credential probing through.
 */
export async function verifyTurnstileToken(
  secret: string,
  token: string,
  remoteip?: string,
): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(remoteip ? { remoteip } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return false;
  }
  if (!response.ok) return false;
  const result = (await response.json().catch(() => null)) as { success?: unknown } | null;
  return result?.success === true;
}

/**
 * No-op unless Turnstile is configured, so self-hosted instances without the keys are
 * completely unaffected. Verification runs before any credential lookup, account
 * creation, or email send, so bots cannot spend the routes' rate-limit budget on real
 * work even when they pass the widget.
 */
export async function requireTurnstile(
  config: AppConfig,
  token: string | undefined,
  remoteip: string | undefined,
): Promise<void> {
  const secret = config.REMENTUM_TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (!token || !(await verifyTurnstileToken(secret, token, remoteip))) {
    throw new DomainError("turnstile_failed", "Captcha verification failed", 403);
  }
}
