"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type Dictionary, template } from "../lib/i18n/get-dictionary";
import type { Locale } from "../lib/i18n/locales";
import { renderTerms } from "../lib/i18n/terms";
import { Button, WibblingSpinner } from "./pui";
import { TurnstileChallenge } from "./turnstile";
import { Field, fieldControlClass } from "./ui/field";

const apiBase = (process.env.NEXT_PUBLIC_REMENTUM_API_URL ?? "").replace(/\/$/, "");

const successBanner =
  "rounded-control border border-green/25 bg-green/10 px-3 py-2 text-sm text-green";
const errorBanner = "rounded-control border border-red/25 bg-red/10 px-3 py-2 text-sm text-red";

async function request(path: string, body: Record<string, unknown>, errorMessage: string) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.title ?? errorMessage);
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
  strings,
  locale,
}: {
  returnTo: string;
  signupEnabled: boolean;
  turnstileSiteKey: string | null;
  strings: Dictionary["auth"];
  locale: Locale;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const turnstile = useTurnstileGuard(turnstileSiteKey);
  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      await request(
        "/api/v1/auth/session",
        {
          email: formData.get("email"),
          password: formData.get("password"),
          ...(turnstile.siteKey ? { turnstileToken: turnstile.turnstileToken } : {}),
        },
        strings.requestError,
      );
      window.location.assign(returnTo);
    } catch (value) {
      setError((value as Error).message);
      setBusy(false);
      turnstile.resetTurnstile();
    }
  }
  return (
    <form className="flex flex-col gap-4" action={submit}>
      <Field label={renderTerms(strings.email)} htmlFor="login-email">
        <input
          id="login-email"
          className={fieldControlClass}
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </Field>
      <Field label={renderTerms(strings.password)} htmlFor="login-password">
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
          locale={locale}
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
        {busy ? strings.signingIn : strings.signIn}
      </Button>
      {signupEnabled ? (
        <Button as={Link} href="/register" variant="ghost" block>
          {strings.createAccount}
        </Button>
      ) : null}
      <Link
        className="text-center text-sm font-medium text-accent hover:underline"
        href="/forgot-password"
      >
        {strings.forgotPassword}
      </Link>
    </form>
  );
}

export function RegisterForm({
  turnstileSiteKey,
  strings,
  locale,
}: {
  turnstileSiteKey: string | null;
  strings: Dictionary["auth"];
  locale: Locale;
}) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");
  const turnstile = useTurnstileGuard(turnstileSiteKey);
  async function submit(formData: FormData) {
    setState("busy");
    setError("");
    try {
      await request(
        "/api/v1/auth/register",
        {
          displayName: formData.get("displayName"),
          email: formData.get("email"),
          password: formData.get("password"),
          teamName: formData.get("teamName"),
          ...(turnstile.siteKey ? { turnstileToken: turnstile.turnstileToken } : {}),
        },
        strings.requestError,
      );
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
        <p className={successBanner}>{strings.checkInbox}</p>
        <Button as={Link} href="/auth/login" variant="solid" block>
          {strings.goToSignIn}
        </Button>
        <Button as={Link} href="/resend-verification" variant="ghost" block>
          {strings.resendVerification}
        </Button>
      </div>
    );
  return (
    <form className="flex flex-col gap-4" action={submit}>
      <Field label={renderTerms(strings.yourName)} htmlFor="register-name">
        <input
          id="register-name"
          className={fieldControlClass}
          name="displayName"
          maxLength={160}
          autoComplete="name"
          required
        />
      </Field>
      <Field label={renderTerms(strings.email)} htmlFor="register-email">
        <input
          id="register-email"
          className={fieldControlClass}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </Field>
      <Field
        label={renderTerms(strings.password)}
        htmlFor="register-password"
        hint={strings.passwordHint}
      >
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
      <Field label={renderTerms(strings.firstTeam)} htmlFor="register-team">
        <input
          id="register-team"
          className={fieldControlClass}
          name="teamName"
          maxLength={160}
          placeholder={strings.teamPlaceholder}
          required
        />
      </Field>
      {turnstile.siteKey ? (
        <TurnstileChallenge
          locale={locale}
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
        {state === "busy" ? strings.creatingAccount : strings.createAccount}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm({
  turnstileSiteKey,
  strings,
  locale,
}: {
  turnstileSiteKey: string | null;
  strings: Dictionary["auth"];
  locale: Locale;
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const turnstile = useTurnstileGuard(turnstileSiteKey);
  async function submit(formData: FormData) {
    setError("");
    try {
      await request(
        "/api/v1/auth/forgot-password",
        {
          email: formData.get("email"),
          ...(turnstile.siteKey ? { turnstileToken: turnstile.turnstileToken } : {}),
        },
        strings.requestError,
      );
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
      <Field label={renderTerms(strings.accountEmail)} htmlFor="forgot-email">
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
          locale={locale}
          key={turnstile.challenge}
          siteKey={turnstile.siteKey}
          onToken={turnstile.onTurnstileToken}
          onReset={turnstile.onTurnstileReset}
        />
      ) : null}
      {sent ? <p className={successBanner}>{strings.resetSent}</p> : null}
      {error ? <p className={errorBanner}>{error}</p> : null}
      <Button type="submit" variant="solid" block disabled={turnstile.turnstileBlocked}>
        {strings.sendResetLink}
      </Button>
    </form>
  );
}

export function ResendVerificationForm({
  turnstileSiteKey,
  strings,
  locale,
}: {
  turnstileSiteKey: string | null;
  strings: Dictionary["auth"];
  locale: Locale;
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const turnstile = useTurnstileGuard(turnstileSiteKey);
  async function submit(formData: FormData) {
    setError("");
    try {
      await request(
        "/api/v1/auth/resend-verification",
        {
          email: formData.get("email"),
          ...(turnstile.siteKey ? { turnstileToken: turnstile.turnstileToken } : {}),
        },
        strings.requestError,
      );
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
      <Field label={renderTerms(strings.accountEmail)} htmlFor="resend-email">
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
          locale={locale}
          key={turnstile.challenge}
          siteKey={turnstile.siteKey}
          onToken={turnstile.onTurnstileToken}
          onReset={turnstile.onTurnstileReset}
        />
      ) : null}
      {sent ? <p className={successBanner}>{strings.verificationSent}</p> : null}
      {error ? <p className={errorBanner}>{error}</p> : null}
      <Button type="submit" variant="solid" block disabled={turnstile.turnstileBlocked}>
        {strings.resendVerification}
      </Button>
    </form>
  );
}

export function TokenActionForm({
  token,
  kind,
  strings,
}: {
  token: string;
  kind: "verify" | "reset";
  strings: Dictionary["auth"];
}) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setError("");
    try {
      await request(
        kind === "verify" ? "/api/v1/auth/verify-email" : "/api/v1/auth/reset-password",
        kind === "verify" ? { token } : { token, password: formData.get("password") },
        strings.requestError,
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
          {kind === "verify" ? strings.emailVerified : strings.passwordUpdated}
        </p>
        <Button as={Link} href="/auth/login" variant="solid" block>
          {strings.signIn}
        </Button>
      </div>
    );
  return (
    <form className="flex flex-col gap-4" action={submit}>
      {kind === "reset" ? (
        <Field
          label={renderTerms(strings.newPassword)}
          htmlFor="reset-password"
          hint={strings.passwordHint}
        >
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
        {kind === "verify" ? strings.verifyEmail : strings.setNewPassword}
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

export function TeamInviteAcceptance({
  token,
  signedIn,
  strings,
}: {
  token: string;
  signedIn: boolean;
  strings: Dictionary["teams"];
}) {
  const roles: Record<string, string> = {
    owner: strings.roleOwner,
    admin: strings.roleAdmin,
    member: strings.roleMember,
  };
  const [metadata, setMetadata] = useState<InviteMetadata | null>(null);
  const [loadError, setLoadError] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${apiBase}/api/v1/team-invitations/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.title ?? strings.invalidInvitation);
        setMetadata(body);
      })
      .catch((value) => setLoadError((value as Error).message));
  }, [token, strings.invalidInvitation]);

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
      if (!response.ok) throw new Error(body.title ?? strings.acceptError);
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
        <WibblingSpinner verbs={[strings.loadingInvitation]} />
      </div>
    );
  if (state === "done")
    return (
      <div className="flex flex-col gap-4">
        <p className={successBanner}>{template(strings.joinedTeam, { name: metadata.name })}</p>
        <Button as={Link} href="/dashboard" variant="solid" block>
          {strings.openTeam}
        </Button>
      </div>
    );
  if (metadata.loginRequired && !signedIn)
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">{strings.existingTeamAccount}</p>
        <Button
          as={Link}
          href={`/auth/login?returnTo=${encodeURIComponent(`/team-invite/${token}`)}`}
          variant="solid"
          block
        >
          {strings.signInToAccept}
        </Button>
      </div>
    );
  return (
    <form className="flex flex-col gap-4" action={submit}>
      <p className="flex items-center justify-between gap-4 rounded-control border border-dashed border-line bg-inset/50 px-3.5 py-2.5">
        <strong className="text-sm font-semibold text-ink">{metadata.name}</strong>
        <span className="font-mono text-2xs uppercase tracking-[0.08em] text-ink-3">
          {renderTerms(roles[metadata.role] ?? metadata.role)}
        </span>
      </p>
      {!signedIn ? (
        <>
          {!metadata.existingAccount ? (
            <Field label={strings.displayName} htmlFor="team-invite-name">
              <input
                id="team-invite-name"
                className={fieldControlClass}
                name="displayName"
                maxLength={160}
                required
              />
            </Field>
          ) : null}
          <Field label={strings.password} htmlFor="team-invite-password">
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
        {state === "busy" ? strings.joining : strings.acceptInvitation}
      </Button>
    </form>
  );
}
