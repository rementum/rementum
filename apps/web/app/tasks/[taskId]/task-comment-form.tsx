"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../components/pui";
import { Field, fieldControlClass } from "../../../components/ui/field";
import type { Dictionary } from "../../../lib/i18n/get-dictionary";

export function TaskCommentForm({
  taskId,
  strings,
}: {
  taskId: string;
  strings: Dictionary["tasks"];
}) {
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
    if (!response.ok) setError(strings.commentError);
    else router.refresh();
    setBusy(false);
  }
  return (
    <form className="grid gap-3" action={submit}>
      <Field label={strings.comment} htmlFor="task-comment">
        <textarea
          className={`${fieldControlClass} min-h-24`}
          id="task-comment"
          name="body"
          required
          maxLength={20000}
        />
      </Field>
      {error ? <p className="text-sm text-red">{error}</p> : null}
      <div>
        <Button variant="solid" size="sm" disabled={busy} type="submit">
          {strings.addComment}
        </Button>
      </div>
    </form>
  );
}
