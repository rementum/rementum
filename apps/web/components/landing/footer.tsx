"use client";

import type { Dictionary } from "../../lib/i18n/get-dictionary";
import { DOCS_URL } from "../../lib/site";
import { BigBack } from "../pui";

export function LandingFooter({
  githubUrl,
  signupEnabled,
  signedIn,
  dict,
}: {
  githubUrl: string;
  signupEnabled: boolean;
  signedIn: boolean;
  dict: Dictionary;
}) {
  const footer = dict.footer;
  return (
    <BigBack
      company="Rementum"
      copyright={footer.copyright}
      columns={[
        {
          heading: footer.product,
          links: [
            { label: footer.howItWorks, href: "#how-it-works" },
            { label: footer.pricing, href: "#pricing" },
            { label: footer.connectAgent, href: "#connect" },
            { label: footer.documentation, href: DOCS_URL },
          ],
        },
        {
          heading: footer.openSource,
          links: [
            { label: footer.github, href: githubUrl },
            { label: footer.license, href: `${githubUrl}/blob/main/LICENSE` },
            { label: footer.releases, href: `${githubUrl}/releases` },
          ],
        },
        {
          heading: footer.account,
          // A signed-in visitor keeps reading the marketing page in the public shell, so
          // the header swaps these for a Dashboard link; the footer has to agree with it.
          links: [
            ...(signedIn
              ? [{ label: dict.common.dashboard, href: "/dashboard" }]
              : [
                  { label: dict.common.signIn, href: "/auth/login" },
                  ...(signupEnabled
                    ? [{ label: dict.common.createAccount, href: "/register" }]
                    : []),
                ]),
            { label: footer.resetPassword, href: "/forgot-password" },
          ],
        },
      ]}
      social={[{ label: footer.github, href: githubUrl }]}
    />
  );
}
