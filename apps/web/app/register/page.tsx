import { RegisterForm } from "../../components/account-flows";
import { AuthShell } from "../../components/auth-shell";
import { GradientText } from "../../components/pui";
import { publicAuthConfig } from "../../lib/api";

export default async function RegisterPage() {
  const { turnstileSiteKey } = await publicAuthConfig();
  return (
    <AuthShell
      kicker="Open registration"
      title={
        <>
          Create your <GradientText>account</GradientText>.
        </>
      }
      description="Start with one team, then create as many as you need."
    >
      <RegisterForm turnstileSiteKey={turnstileSiteKey} />
    </AuthShell>
  );
}
