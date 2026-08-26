"use client";

import { Button } from "../components/pui";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-16">
      <section className="rounded-card border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-ink">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-red" />
          Could not load the brain
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-2">
          The server returned an error. Your stored knowledge is unchanged.
        </p>
        <div className="mt-5 flex justify-center">
          <Button variant="solid" onClick={reset}>
            Try again
          </Button>
        </div>
      </section>
    </main>
  );
}
