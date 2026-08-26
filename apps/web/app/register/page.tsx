import { RegisterForm } from "../../components/account-flows";
import { AuthShell } from "../../components/auth-shell";
import { GradientText } from "../../components/pui";

export default function RegisterPage() {
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
      <RegisterForm />
    </AuthShell>
  );
}
