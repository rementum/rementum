import { TeamInviteAcceptance } from "../../../components/account-flows";
import { AuthShell } from "../../../components/auth-shell";
import { GradientText } from "../../../components/pui";
import { hasSession } from "../../../lib/api";

export default async function TeamInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell
      kicker="Team invitation"
      title={
        <>
          Join your <GradientText>team</GradientText>.
        </>
      }
      description="Join the team to access and edit every brain it owns."
    >
      <TeamInviteAcceptance token={token} signedIn={await hasSession()} />
    </AuthShell>
  );
}
