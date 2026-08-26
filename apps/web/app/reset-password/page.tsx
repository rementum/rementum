import { TokenActionForm } from "../../components/account-flows";
import { AuthShell } from "../../components/auth-shell";
import { GradientText } from "../../components/pui";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <AuthShell
      kicker="Account recovery"
      title={
        <>
          Choose a new <GradientText>password</GradientText>.
        </>
      }
      description="Completing this reset signs out your other sessions."
    >
      <TokenActionForm token={token} kind="reset" />
    </AuthShell>
  );
}
