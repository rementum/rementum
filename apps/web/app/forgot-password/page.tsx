import { ForgotPasswordForm } from "../../components/account-flows";
import { AuthShell } from "../../components/auth-shell";
import { GradientText } from "../../components/pui";

export default function ForgotPasswordPage() {
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
      <ForgotPasswordForm />
    </AuthShell>
  );
}
