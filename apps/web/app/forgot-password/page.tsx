import { ForgotPasswordForm } from "../../components/account-flows";
import { AuthShell } from "../../components/auth-shell";
import { GradientText } from "../../components/pui";
import { publicAuthConfig } from "../../lib/api";

export default async function ForgotPasswordPage() {
  const { turnstileSiteKey } = await publicAuthConfig();
  return (
    <AuthShell
      kicker="Account recovery"
      title={
        <>
          Reset your <GradientText>password</GradientText>.
        </>
      }
      description="We will send a one-time link if the account exists."
    >
      <ForgotPasswordForm turnstileSiteKey={turnstileSiteKey} />
    </AuthShell>
  );
}
