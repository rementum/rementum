"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TaskCommentForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(formData: FormData) {
    setBusy(true);
    const response = await fetch(`/bridge/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: formData.get("body") }),
    });
    if (!response.ok) setError("Could not add the comment.");
    else router.refresh();
    setBusy(false);
  }
  return (
    <form className="comment-form" action={submit}>
      <label>
        Comment
        <textarea name="body" required maxLength={20000} />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button" disabled={busy} type="submit">
        Add comment
      </button>
    </form>
  );
}
