"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="shell">
      <section className="empty-state">
        <h1>Could not load the brain</h1>
        <p>The server returned an error. Your stored knowledge was not changed.</p>
        <button className="button" type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
