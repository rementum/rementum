"use client";

import { useState } from "react";

export function InviteForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setState("submitting");
    setError("");
    const response = await fetch("/api/v1/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        displayName: formData.get("displayName"),
        password: formData.get("password"),
      }),
    });
    if (!response.ok) {
      setError("This invitation is invalid, expired, or already used.");
      setState("error");
      return;
    }
    setState("success");
    window.location.href = "/auth/login";
  }
  return (
    <form className="invite-form" action={submit}>
      <label>
        Display name
        <input name="displayName" minLength={1} maxLength={160} required />
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
