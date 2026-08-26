"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const apiBase = (process.env.NEXT_PUBLIC_REMENTUM_API_URL ?? "").replace(/\/$/, "");

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

export function RegisterForm() {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setState("busy");
    setError("");
    try {
      await request("/api/v1/auth/register", {
        displayName: formData.get("displayName"),
        email: formData.get("email"),
        password: formData.get("password"),
        teamName: formData.get("teamName"),
      });
      setState("sent");
    } catch (value) {
      setError((value as Error).message);
      setState("idle");
    }
  }
  if (state === "sent")
    return (
      <div className="invite-form">
        <p className="form-success">Check your inbox and verify your email before signing in.</p>
        <Link className="button" href="/auth/login">
          Go to sign in
        </Link>
        <Link className="button secondary" href="/resend-verification">
          Resend verification
        </Link>
      </div>
    );
  return (
    <form className="invite-form" action={submit}>
      <label>
        Your name
        <input name="displayName" maxLength={160} autoComplete="name" required />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          minLength={12}
          autoComplete="new-password"
          required
        />
        <small>At least 12 characters.</small>
      </label>
      <label>
        First team
        <input name="teamName" maxLength={160} placeholder="Acme engineering" required />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button" type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setError("");
    try {
      await request("/api/v1/auth/forgot-password", { email: formData.get("email") });
      setSent(true);
    } catch (value) {
      setError((value as Error).message);
    }
  }
  return (
    <form className="invite-form" action={submit}>
      <label>
        Account email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {sent ? (
        <p className="form-success">If the account exists, a reset link is on its way.</p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button" type="submit">
        Send reset link
      </button>
    </form>
  );
}

export function ResendVerificationForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setError("");
    try {
      await request("/api/v1/auth/resend-verification", { email: formData.get("email") });
      setSent(true);
    } catch (value) {
      setError((value as Error).message);
    }
  }
  return (
    <form className="invite-form" action={submit}>
      <label>
        Account email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {sent ? (
        <p className="form-success">If verification is pending, a new link is on its way.</p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button" type="submit">
        Resend verification
      </button>
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
      <div className="invite-form">
        <p className="form-success">
          {kind === "verify"
            ? "Email verified."
            : "Password updated and existing sessions revoked."}
        </p>
        <Link className="button" href="/auth/login">
          Sign in
        </Link>
      </div>
    );
  return (
    <form className="invite-form" action={submit}>
      {kind === "reset" ? (
        <label>
          New password
          <input
            name="password"
            type="password"
            minLength={12}
            autoComplete="new-password"
            required
          />
          <small>At least 12 characters.</small>
        </label>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button" type="submit">
        {kind === "verify" ? "Verify email" : "Set new password"}
      </button>
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

  if (loadError) return <p className="form-error">{loadError}</p>;
  if (!metadata) return <p className="invite-form">Loading invitation…</p>;
  if (state === "done")
    return (
      <div className="invite-form">
        <p className="form-success">You joined {metadata.name}.</p>
        <Link className="button" href="/">
          Open team
        </Link>
      </div>
    );
  if (metadata.loginRequired && !signedIn)
    return (
      <div className="invite-form">
        <p>
          This invitation is for an existing account. Sign in with the invited email to continue.
        </p>
        <Link
          className="button"
          href={`/auth/login?returnTo=${encodeURIComponent(`/team-invite/${token}`)}`}
        >
          Sign in to accept
        </Link>
      </div>
    );
  return (
    <form className="invite-form" action={submit}>
      <p className="invite-summary">
        <strong>{metadata.name}</strong>
        <span>{metadata.role}</span>
      </p>
      {!signedIn ? (
        <>
          {!metadata.existingAccount ? (
            <label>
              Display name
              <input name="displayName" maxLength={160} required />
            </label>
          ) : null}
          <label>
            Password
            <input name="password" type="password" minLength={12} required />
          </label>
        </>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button" type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Joining…" : "Accept invitation"}
      </button>
    </form>
  );
}
