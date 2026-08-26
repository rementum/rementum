import { TokenActionForm } from "../../components/account-flows";
import { AuthShell } from "../../components/auth-shell";
import { GradientText } from "../../components/pui";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <AuthShell
      kicker="Account verification"
      title={
        <>
          Verify your <GradientText>email</GradientText>.
        </>
      }
      description="This one-time link activates your account."
    >
      <TokenActionForm token={token} kind="verify" />
    </AuthShell>
  );
}
