import { ResendVerificationForm } from "../../components/account-flows";
import { AuthShell } from "../../components/auth-shell";
import { GradientText } from "../../components/pui";

export default function ResendVerificationPage() {
  return (
    <AuthShell
      kicker="Account verification"
      title={
        <>
          Send a new <GradientText>link</GradientText>.
        </>
      }
      description="Requesting a new link disables the previous ones."
    >
      <ResendVerificationForm />
    </AuthShell>
  );
}
