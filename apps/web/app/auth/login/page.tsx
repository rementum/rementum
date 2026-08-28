import { redirect } from "next/navigation";
import { LoginForm } from "../../../components/account-flows";
import { AuthShell } from "../../../components/auth-shell";
import { GradientText } from "../../../components/pui";
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
  const { signupEnabled, turnstileSiteKey } = await publicAuthConfig();
  return (
    <AuthShell
      kicker="Web session"
      title={
        <>
          Sign in to <GradientText>Rementum</GradientText>.
        </>
      }
      description="Open your teams and workspaces. You approve OAuth grants only when an MCP client connects."
    >
      <LoginForm
        returnTo={destination}
        signupEnabled={signupEnabled}
        turnstileSiteKey={turnstileSiteKey}
      />
    </AuthShell>
  );
}
