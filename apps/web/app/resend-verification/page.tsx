import type { Metadata } from "next";
import { ResendVerificationForm } from "../../components/account-flows";
import { AuthShell } from "../../components/auth-shell";
import { GradientText } from "../../components/pui";
import { publicAuthConfig } from "../../lib/api";

import { requestDictionary } from "../../lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.auth.resendVerification };
}

export default async function ResendVerificationPage() {
  const { locale, dict } = await requestDictionary();
  const strings = dict.auth;
  const { turnstileSiteKey } = await publicAuthConfig();
  return (
    <AuthShell
      kicker={strings.accountVerification}
      title={<GradientText>{strings.resendTitle}</GradientText>}
      description={strings.resendDescription}
    >
      <ResendVerificationForm
        strings={strings}
        locale={locale}
        turnstileSiteKey={turnstileSiteKey}
      />
    </AuthShell>
  );
}
