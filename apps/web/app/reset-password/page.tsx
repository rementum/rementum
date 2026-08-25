import { TokenActionForm } from "../../components/account-flows";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main className="shell invite-shell">
      <section className="invite-copy">
        <p className="kicker">Account recovery</p>
        <h1>Choose a new password.</h1>
        <p>Completing this reset signs out your other sessions.</p>
      </section>
      <TokenActionForm token={token} kind="reset" />
    </main>
  );
}
