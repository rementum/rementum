"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const apiBase = (process.env.NEXT_PUBLIC_OWL_API_URL ?? "").replace(/\/$/, "");

export function InviteForm({ token, signedIn }: { token: string; signedIn: boolean }) {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState<{
    name: string;
    role: string;
    existingAccount: boolean;
    loginRequired: boolean;
  } | null>(null);
  useEffect(() => {
    fetch(`${apiBase}/api/v1/invitations/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.title ?? "Invitation is invalid or expired.");
        setMetadata(body);
      })
      .catch((value) => setError((value as Error).message));
  }, [token]);
  async function submit(formData: FormData) {
    setState("submitting");
    setError("");
    const path = signedIn ? "/bridge/invitations/accept" : "/api/v1/invitations/accept";
    const response = await fetch(`${signedIn ? "" : apiBase}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        displayName: formData.get("displayName") || undefined,
        password: formData.get("password") || undefined,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.title ?? "This invitation is invalid, expired, or already used.");
      setState("error");
      return;
    }
    setState("success");
    window.location.href = signedIn ? "/" : "/auth/login";
  }
  if (error && !metadata) return <p className="form-error">{error}</p>;
  if (!metadata) return <p className="invite-form">Loading invitation…</p>;
  if (metadata.loginRequired && !signedIn)
    return (
      <div className="invite-form">
        <p>This invitation is for an existing account.</p>
        <Link
          className="button"
          href={`/auth/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`}
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
              <input name="displayName" minLength={1} maxLength={160} required />
            </label>
          ) : null}
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
        </>
      ) : null}
      {state === "error" ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {state === "success" ? (
        <p className="form-success">Account created. Redirecting to sign in.</p>
      ) : null}
      <button className="button" disabled={state === "submitting"} type="submit">
        {state === "submitting" ? "Creating account…" : "Accept invite"}
      </button>
    </form>
  );
}
