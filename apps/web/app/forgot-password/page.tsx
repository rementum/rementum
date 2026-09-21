import type { Metadata } from "next";
import { ForgotPasswordForm } from "../../components/account-flows";
import { AuthShell } from "../../components/auth-shell";
import { GradientText } from "../../components/pui";
import { publicAuthConfig } from "../../lib/api";

import { requestDictionary } from "../../lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.auth.forgotMetadata };
}

export default async function ForgotPasswordPage() {
  const { locale, dict } = await requestDictionary();
  const strings = dict.auth;
  const { turnstileSiteKey } = await publicAuthConfig();
  return (
    <AuthShell
      kicker={strings.accountRecovery}
      title={<GradientText>{strings.forgotTitle}</GradientText>}
      description={strings.forgotDescription}
    >
      <ForgotPasswordForm strings={strings} locale={locale} turnstileSiteKey={turnstileSiteKey} />
    </AuthShell>
  );
}
