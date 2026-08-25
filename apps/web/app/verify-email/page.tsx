import { TokenActionForm } from "../../components/account-flows";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main className="shell invite-shell">
      <section className="invite-copy">
        <p className="kicker">Account verification</p>
        <h1>Verify your email.</h1>
        <p>This one-time link activates your account.</p>
      </section>
      <TokenActionForm token={token} kind="verify" />
    </main>
  );
}
