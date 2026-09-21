import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "../../../components/account-flows";
import { AuthShell } from "../../../components/auth-shell";
import { GradientText } from "../../../components/pui";
import { hasSession, publicAuthConfig } from "../../../lib/api";
import { requestDictionary } from "../../../lib/i18n/server";
import { safeReturnTo } from "../../../lib/return-to";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.auth.loginMetadata };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { locale, dict } = await requestDictionary();
  const strings = dict.auth;
  const { returnTo } = await searchParams;
  const destination = safeReturnTo(returnTo);
  if (await hasSession()) redirect(destination);
  const { signupEnabled, turnstileSiteKey } = await publicAuthConfig();
  return (
    <AuthShell
      kicker={strings.webSession}
      title={<GradientText>{strings.loginTitle}</GradientText>}
      description={strings.loginDescription}
    >
      <LoginForm
        strings={strings}
        locale={locale}
        returnTo={destination}
        signupEnabled={signupEnabled}
        turnstileSiteKey={turnstileSiteKey}
      />
    </AuthShell>
  );
}
