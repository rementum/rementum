import { ResendVerificationForm } from "../../components/account-flows";

export default function ResendVerificationPage() {
  return (
    <main className="shell invite-shell">
      <section className="invite-copy">
        <p className="kicker">Account verification</p>
        <h1>Send a fresh link.</h1>
        <p>Previous verification links stop working when a new one is issued.</p>
      </section>
      <ResendVerificationForm />
    </main>
  );
}
