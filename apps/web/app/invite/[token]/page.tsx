import type { Metadata } from "next";
import { AuthShell } from "../../../components/auth-shell";
import { GradientText } from "../../../components/pui";
import { hasSession } from "../../../lib/api";
import { requestDictionary } from "../../../lib/i18n/server";
import { InviteForm } from "./invite-form";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.teams.brainInvitation };
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { dict } = await requestDictionary();
  const strings = dict.teams;
  const { token } = await params;
  return (
    <AuthShell
      kicker={strings.brainInvitation}
      title={<GradientText>{strings.joinBrainTitle}</GradientText>}
      description={strings.joinBrainDescription}
    >
      <InviteForm
        strings={strings}
        brainStrings={dict.brains}
        token={token}
        signedIn={await hasSession()}
      />
    </AuthShell>
  );
}
