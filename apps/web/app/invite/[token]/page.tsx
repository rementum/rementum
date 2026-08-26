import { AuthShell } from "../../../components/auth-shell";
import { GradientText } from "../../../components/pui";
import { hasSession } from "../../../lib/api";
import { InviteForm } from "./invite-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell
      kicker="Shared brain invitation"
      title={
        <>
          Join the <GradientText>knowledge</GradientText> loop.
        </>
      }
      description="Create your local account. The invitation grants access only to the brain and role selected by its owner."
    >
      <InviteForm token={token} signedIn={await hasSession()} />
    </AuthShell>
  );
}
