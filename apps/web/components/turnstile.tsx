"use client";

import { Turnstile } from "@marsidev/react-turnstile";

/**
 * Renders the Cloudflare Turnstile widget for an account flow. The parent owns the token
 * state and passes `onToken` when the challenge is solved; `onReset` fires on expiry and
 * on error so the parent can drop a token that Cloudflare will no longer accept.
 * Remounting the widget (a changed `key`) is the sanctioned way to force a fresh
 * challenge after a failed submit — the token a siteverify consumed is single-use.
 */
export function TurnstileChallenge({
  siteKey,
  onToken,
  onReset,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onReset: () => void;
}) {
  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={onToken}
      onExpire={onReset}
      onError={onReset}
      options={{ size: "flexible", theme: "auto" }}
    />
  );
}
