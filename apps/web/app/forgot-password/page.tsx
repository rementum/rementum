import { ForgotPasswordForm } from "../../components/account-flows";

export default function ForgotPasswordPage() {
  return (
    <main className="shell invite-shell">
      <section className="invite-copy">
        <p className="kicker">Account recovery</p>
        <h1>Reset your password.</h1>
        <p>We will send a one-time link if the account exists.</p>
      </section>
      <ForgotPasswordForm />
    </main>
  );
}
