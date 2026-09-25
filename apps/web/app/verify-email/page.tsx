import type { Metadata } from "next";
import { TokenActionForm } from "../../components/account-flows";
import { AuthShell } from "../../components/auth-shell";
import { GradientText } from "../../components/pui";

import { requestDictionary } from "../../lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.auth.verifyEmail };
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { dict } = await requestDictionary();
  const strings = dict.auth;
  const { token = "" } = await searchParams;
  return (
    <AuthShell
      kicker={strings.accountVerification}
      title={<GradientText>{strings.verifyTitle}</GradientText>}
      description={strings.verifyDescription}
    >
      <TokenActionForm strings={strings} token={token} kind="verify" />
    </AuthShell>
  );
}
