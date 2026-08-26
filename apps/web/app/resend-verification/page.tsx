import { ResendVerificationForm } from "../../components/account-flows";
import { AuthShell } from "../../components/auth-shell";
import { GradientText } from "../../components/pui";

export default function ResendVerificationPage() {
  return (
    <AuthShell
      kicker="Account verification"
      title={
        <>
          Send a fresh <GradientText>link</GradientText>.
        </>
      }
      description="Previous verification links stop working when a new one is issued."
    >
      <ResendVerificationForm />
    </AuthShell>
  );
}
