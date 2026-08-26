import { redirect } from "next/navigation";
import { LoginForm } from "../../../components/account-flows";
import { hasSession, publicAuthConfig } from "../../../lib/api";
import { safeReturnTo } from "../../../lib/return-to";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const destination = safeReturnTo(returnTo);
  if (await hasSession()) redirect(destination);
  const { signupEnabled } = await publicAuthConfig();
  return (
    <main className="shell invite-shell">
      <section className="invite-copy">
        <p className="kicker">Web session</p>
        <h1>Sign in to Rementum.</h1>
        <p>
          Open your teams and workspaces. OAuth approval is only used when connecting an MCP client.
        </p>
      </section>
      <LoginForm returnTo={destination} signupEnabled={signupEnabled} />
    </main>
  );
}
