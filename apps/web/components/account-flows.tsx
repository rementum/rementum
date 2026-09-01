"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, WibblingSpinner } from "./pui";
import { TurnstileChallenge } from "./turnstile";
import { Field, fieldControlClass } from "./ui/field";

const apiBase = (process.env.NEXT_PUBLIC_REMENTUM_API_URL ?? "").replace(/\/$/, "");

const successBanner =
  "rounded-control border border-green/25 bg-green/10 px-3 py-2 text-sm text-green";
const errorBanner = "rounded-control border border-red/25 bg-red/10 px-3 py-2 text-sm text-red";

async function request(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.title ?? "The request could not be completed.");
  return payload;
}

/**
 * A spent Turnstile token is single-use, so every failed submit drops the token and
 * remounts the widget for a fresh challenge. The submit button stays locked until the
 * challenge is solved whenever bot protection is configured.
 */
function useTurnstileGuard(initialSiteKey: string | null) {
  const [siteKey, setSiteKey] = useState(initialSiteKey);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const resetTurnstile = () => {
    setTurnstileToken("");
    setChallenge((n) => n + 1);
    // A null site key may be the server-render fallback from a moment the API was
    // unreachable, while the API itself still demands a token. Re-check from the
    // browser so a submit rejected for a missing captcha recovers its widget
    // instead of failing identically on every retry.
    if (!siteKey) {
      fetch(`${apiBase}/api/v1/auth/config`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
          if (body?.turnstileSiteKey) setSiteKey(body.turnstileSiteKey as string);
        })
        .catch(() => null);
    }
  };
  return {
    siteKey,
    turnstileToken,
    challenge,
    onTurnstileToken: setTurnstileToken,
    onTurnstileReset: () => setTurnstileToken(""),
    resetTurnstile,
    turnstileBlocked: Boolean(siteKey) && !turnstileToken,
  };
}

export function LoginForm({
  returnTo,
  signupEnabled,
  turnstileSiteKey,
}: {
  returnTo: string;
  signupEnabled: boolean;
  turnstileSiteKey: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const turnstile = useTurnstileGuard(turnstileSiteKey);
  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      await request("/api/v1/auth/session", {
        email: formData.get("email"),
        password: formData.get("password"),
        ...(turnstile.siteKey ? { turnstileToken: turnstile.turnstileToken } : {}),
      });
      window.location.assign(returnTo);
    } catch (value) {
      setError((value as Error).message);
      setBusy(false);
      turnstile.resetTurnstile();
    }
  }
  return (
    <form className="flex flex-col gap-4" action={submit}>
      <Field label="Email" htmlFor="login-email">
        <input
          id="login-email"
          className={fieldControlClass}
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </Field>
      <Field label="Password" htmlFor="login-password">
        <input
          id="login-password"
          className={fieldControlClass}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      {turnstile.siteKey ? (
        <TurnstileChallenge
          key={turnstile.challenge}
          siteKey={turnstile.siteKey}
          onToken={turnstile.onTurnstileToken}
          onReset={turnstile.onTurnstileReset}
        />
      ) : null}
      {error ? <p className={errorBanner}>{error}</p> : null}
      <Button
        type="submit"
        variant="solid"
        block
        loading={busy}
        disabled={turnstile.turnstileBlocked}
      >
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      {signupEnabled ? (
        <Button as={Link} href="/register" variant="ghost" block>
          Create account
        </Button>
      ) : null}
      <Link
        className="text-center text-sm font-medium text-accent hover:underline"
        href="/forgot-password"
      >
        Forgot password?
      </Link>
    </form>
  );
}

export function RegisterForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");
  const turnstile = useTurnstileGuard(turnstileSiteKey);
  async function submit(formData: FormData) {
    setState("busy");
    setError("");
    try {
      await request("/api/v1/auth/register", {
        displayName: formData.get("displayName"),
        email: formData.get("email"),
        password: formData.get("password"),
        teamName: formData.get("teamName"),
        ...(turnstile.siteKey ? { turnstileToken: turnstile.turnstileToken } : {}),
      });
      setState("sent");
    } catch (value) {
      setError((value as Error).message);
      setState("idle");
      turnstile.resetTurnstile();
    }
  }
  if (state === "sent")
    return (
      <div className="flex flex-col gap-4">
        <p className={successBanner}>Check your inbox and verify your email before signing in.</p>
        <Button as={Link} href="/auth/login" variant="solid" block>
          Go to sign in
        </Button>
        <Button as={Link} href="/resend-verification" variant="ghost" block>
          Resend verification
        </Button>
      </div>
    );
  return (
    <form className="flex flex-col gap-4" action={submit}>
      <Field label="Your name" htmlFor="register-name">
        <input
          id="register-name"
          className={fieldControlClass}
          name="displayName"
          maxLength={160}
          autoComplete="name"
          required
        />
      </Field>
      <Field label="Email" htmlFor="register-email">
        <input
          id="register-email"
          className={fieldControlClass}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </Field>
      <Field label="Password" htmlFor="register-password" hint="At least 12 characters.">
        <input
          id="register-password"
          className={fieldControlClass}
          name="password"
          type="password"
          minLength={12}
          autoComplete="new-password"
          required
        />
      </Field>
      <Field label="First team" htmlFor="register-team">
        <input
          id="register-team"
          className={fieldControlClass}
          name="teamName"
          maxLength={160}
          placeholder="Acme engineering"
          required
        />
      </Field>
      {turnstile.siteKey ? (
        <TurnstileChallenge
          key={turnstile.challenge}
          siteKey={turnstile.siteKey}
          onToken={turnstile.onTurnstileToken}
          onReset={turnstile.onTurnstileReset}
        />
      ) : null}
      {error ? <p className={errorBanner}>{error}</p> : null}
      <Button
        type="submit"
        variant="solid"
        block
        loading={state === "busy"}
        disabled={turnstile.turnstileBlocked}
      >
        {state === "busy" ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const turnstile = useTurnstileGuard(turnstileSiteKey);
  async function submit(formData: FormData) {
    setError("");
    try {
      await request("/api/v1/auth/forgot-password", {
        email: formData.get("email"),
        ...(turnstile.siteKey ? { turnstileToken: turnstile.turnstileToken } : {}),
      });
      setSent(true);
      // The form stays mounted for a re-send, and siteverify just consumed the token.
      turnstile.resetTurnstile();
    } catch (value) {
      setError((value as Error).message);
      turnstile.resetTurnstile();
    }
  }
  return (
    <form className="flex flex-col gap-4" action={submit}>
      <Field label="Account email" htmlFor="forgot-email">
        <input
          id="forgot-email"
          className={fieldControlClass}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </Field>
      {turnstile.siteKey ? (
        <TurnstileChallenge
          key={turnstile.challenge}
          siteKey={turnstile.siteKey}
          onToken={turnstile.onTurnstileToken}
          onReset={turnstile.onTurnstileReset}
        />
      ) : null}
      {sent ? (
        <p className={successBanner}>If the account exists, a reset link is on its way.</p>
      ) : null}
      {error ? <p className={errorBanner}>{error}</p> : null}
      <Button type="submit" variant="solid" block disabled={turnstile.turnstileBlocked}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResendVerificationForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const turnstile = useTurnstileGuard(turnstileSiteKey);
  async function submit(formData: FormData) {
    setError("");
    try {
      await request("/api/v1/auth/resend-verification", {
        email: formData.get("email"),
        ...(turnstile.siteKey ? { turnstileToken: turnstile.turnstileToken } : {}),
      });
      setSent(true);
      // The form stays mounted for a re-send, and siteverify just consumed the token.
      turnstile.resetTurnstile();
    } catch (value) {
      setError((value as Error).message);
      turnstile.resetTurnstile();
    }
  }
  return (
    <form className="flex flex-col gap-4" action={submit}>
      <Field label="Account email" htmlFor="resend-email">
        <input
          id="resend-email"
          className={fieldControlClass}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </Field>
      {turnstile.siteKey ? (
        <TurnstileChallenge
          key={turnstile.challenge}
          siteKey={turnstile.siteKey}
          onToken={turnstile.onTurnstileToken}
          onReset={turnstile.onTurnstileReset}
        />
      ) : null}
      {sent ? (
        <p className={successBanner}>If verification is pending, a new link is on its way.</p>
      ) : null}
      {error ? <p className={errorBanner}>{error}</p> : null}
      <Button type="submit" variant="solid" block disabled={turnstile.turnstileBlocked}>
        Resend verification
      </Button>
    </form>
  );
}

export function TokenActionForm({ token, kind }: { token: string; kind: "verify" | "reset" }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setError("");
    try {
      await request(
        kind === "verify" ? "/api/v1/auth/verify-email" : "/api/v1/auth/reset-password",
        kind === "verify" ? { token } : { token, password: formData.get("password") },
      );
      setDone(true);
    } catch (value) {
      setError((value as Error).message);
    }
  }
  if (done)
    return (
      <div className="flex flex-col gap-4">
        <p className={successBanner}>
          {kind === "verify"
            ? "Email verified."
            : "Password updated and existing sessions revoked."}
        </p>
        <Button as={Link} href="/auth/login" variant="solid" block>
          Sign in
        </Button>
      </div>
    );
  return (
    <form className="flex flex-col gap-4" action={submit}>
      {kind === "reset" ? (
        <Field label="New password" htmlFor="reset-password" hint="At least 12 characters.">
          <input
            id="reset-password"
            className={fieldControlClass}
            name="password"
            type="password"
            minLength={12}
            autoComplete="new-password"
            required
          />
        </Field>
      ) : null}
      {error ? <p className={errorBanner}>{error}</p> : null}
      <Button type="submit" variant="solid" block>
        {kind === "verify" ? "Verify email" : "Set new password"}
      </Button>
    </form>
  );
}

interface InviteMetadata {
  name: string;
  role: string;
  existingAccount: boolean;
  loginRequired: boolean;
}

export function TeamInviteAcceptance({ token, signedIn }: { token: string; signedIn: boolean }) {
  const [metadata, setMetadata] = useState<InviteMetadata | null>(null);
  const [loadError, setLoadError] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${apiBase}/api/v1/team-invitations/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.title ?? "Invitation is invalid or expired.");
        setMetadata(body);
      })
      .catch((value) => setLoadError((value as Error).message));
  }, [token]);

  async function submit(formData: FormData) {
    setState("busy");
    setError("");
    try {
      const path = signedIn ? "/bridge/team-invitations/accept" : "/api/v1/team-invitations/accept";
      const response = await fetch(`${signedIn ? "" : apiBase}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          displayName: formData.get("displayName") || undefined,
          password: formData.get("password") || undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.title ?? "Invitation could not be accepted.");
      if (signedIn && body.workspaceId) {
        await fetch("/workspaces/select", {
          method: "POST",
          body: new URLSearchParams({ workspaceId: body.workspaceId }),
        });
      }
      setState("done");
    } catch (value) {
      setError((value as Error).message);
      setState("idle");
    }
  }

  if (loadError) return <p className={errorBanner}>{loadError}</p>;
  if (!metadata)
    return (
      <div className="flex items-center py-2 text-sm text-ink-2">
        <WibblingSpinner verbs={["Loading invitation"]} />
      </div>
    );
  if (state === "done")
    return (
      <div className="flex flex-col gap-4">
        <p className={successBanner}>You joined {metadata.name}.</p>
        <Button as={Link} href="/dashboard" variant="solid" block>
          Open team
        </Button>
      </div>
    );
  if (metadata.loginRequired && !signedIn)
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">
          This invitation is for an existing account. Sign in with the invited email to continue.
        </p>
        <Button
          as={Link}
          href={`/auth/login?returnTo=${encodeURIComponent(`/team-invite/${token}`)}`}
          variant="solid"
          block
        >
          Sign in to accept
        </Button>
      </div>
    );
  return (
    <form className="flex flex-col gap-4" action={submit}>
      <p className="flex items-center justify-between gap-4 rounded-control border border-dashed border-line bg-inset/50 px-3.5 py-2.5">
        <strong className="text-sm font-semibold text-ink">{metadata.name}</strong>
        <span className="font-mono text-2xs uppercase tracking-[0.08em] text-ink-3">
          {metadata.role}
        </span>
      </p>
      {!signedIn ? (
        <>
          {!metadata.existingAccount ? (
            <Field label="Display name" htmlFor="team-invite-name">
              <input
                id="team-invite-name"
                className={fieldControlClass}
                name="displayName"
                maxLength={160}
                required
              />
            </Field>
          ) : null}
          <Field label="Password" htmlFor="team-invite-password">
            <input
              id="team-invite-password"
              className={fieldControlClass}
              name="password"
              type="password"
              minLength={12}
              required
            />
          </Field>
        </>
      ) : null}
      {error ? <p className={errorBanner}>{error}</p> : null}
      <Button type="submit" variant="solid" block loading={state === "busy"}>
        {state === "busy" ? "Joining…" : "Accept invitation"}
      </Button>
    </form>
  );
}
