import type { Metadata } from "next";
import { TeamInviteAcceptance } from "../../../components/account-flows";
import { AuthShell } from "../../../components/auth-shell";
import { GradientText } from "../../../components/pui";
import { hasSession } from "../../../lib/api";
import { requestDictionary } from "../../../lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.teams.teamInvitation };
}

export default async function TeamInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { dict } = await requestDictionary();
  const strings = dict.teams;
  const { token } = await params;
  return (
    <AuthShell
      kicker={strings.teamInvitation}
      title={<GradientText>{strings.joinTeamTitle}</GradientText>}
      description={strings.joinTeamDescription}
    >
      <TeamInviteAcceptance strings={strings} token={token} signedIn={await hasSession()} />
    </AuthShell>
  );
}
