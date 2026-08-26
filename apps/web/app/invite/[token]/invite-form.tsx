"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, WibblingSpinner } from "../../../components/pui";
import { Field, fieldControlClass } from "../../../components/ui/field";

const apiBase = (process.env.NEXT_PUBLIC_REMENTUM_API_URL ?? "").replace(/\/$/, "");

const successBanner =
  "rounded-control border border-green/25 bg-green/10 px-3 py-2 text-sm text-green";
const errorBanner = "rounded-control border border-red/25 bg-red/10 px-3 py-2 text-sm text-red";

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
  if (error && !metadata) return <p className={errorBanner}>{error}</p>;
  if (!metadata)
    return (
      <div className="flex items-center py-2 text-sm text-ink-2">
        <WibblingSpinner verbs={["Loading invitation"]} />
      </div>
    );
  if (metadata.loginRequired && !signedIn)
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">This invitation is for an existing account.</p>
        <Button
          as={Link}
          href={`/auth/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`}
          variant="glow"
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
            <Field label="Display name" htmlFor="invite-name">
              <input
                id="invite-name"
                className={fieldControlClass}
                name="displayName"
                minLength={1}
                maxLength={160}
                required
              />
            </Field>
          ) : null}
          <Field label="Password" htmlFor="invite-password" hint="At least 12 characters.">
            <input
              id="invite-password"
              className={fieldControlClass}
              name="password"
              type="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </Field>
        </>
      ) : null}
      {state === "error" ? (
        <p className={errorBanner} role="alert">
          {error}
        </p>
      ) : null}
      {state === "success" ? (
        <p className={successBanner}>Account created. Redirecting to sign in.</p>
      ) : null}
      <Button type="submit" variant="glow" block loading={state === "submitting"}>
        {state === "submitting" ? "Creating account…" : "Accept invite"}
      </Button>
    </form>
  );
}
