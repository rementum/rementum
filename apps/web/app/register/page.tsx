import type { Metadata } from "next";
import { RegisterForm } from "../../components/account-flows";
import { AuthShell } from "../../components/auth-shell";
import { GradientText } from "../../components/pui";
import { publicAuthConfig } from "../../lib/api";

import { requestDictionary } from "../../lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.auth.createAccount };
}

export default async function RegisterPage() {
  const { locale, dict } = await requestDictionary();
  const strings = dict.auth;
  const { turnstileSiteKey } = await publicAuthConfig();
  return (
    <AuthShell
      kicker={strings.openRegistration}
      title={<GradientText>{strings.registerTitle}</GradientText>}
      description={strings.registerDescription}
    >
      <RegisterForm strings={strings} locale={locale} turnstileSiteKey={turnstileSiteKey} />
    </AuthShell>
  );
}
