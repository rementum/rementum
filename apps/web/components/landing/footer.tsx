"use client";

import { DOCS_URL } from "../../lib/site";
import { BigBack } from "../pui";

export function LandingFooter({
  githubUrl,
  signupEnabled,
}: {
  githubUrl: string;
  signupEnabled: boolean;
}) {
  return (
    <BigBack
      company="Rementum"
      copyright="Open source · self-hosted"
      columns={[
        {
          heading: "Product",
          links: [
            { label: "How it works", href: "#workflow" },
            { label: "Features", href: "#features" },
            { label: "Architecture", href: "#architecture" },
            { label: "Pricing", href: "#pricing" },
            { label: "Connect an agent", href: "#connect" },
            { label: "Documentation", href: DOCS_URL },
          ],
        },
        {
          heading: "Open source",
          links: [
            { label: "GitHub", href: githubUrl },
            { label: "AGPL-3.0 license", href: `${githubUrl}/blob/main/LICENSE` },
            { label: "Releases", href: `${githubUrl}/releases` },
          ],
        },
        {
          heading: "Account",
          links: [
            { label: "Sign in", href: "/auth/login" },
            ...(signupEnabled ? [{ label: "Create account", href: "/register" }] : []),
            { label: "Reset password", href: "/forgot-password" },
          ],
        },
      ]}
      social={[{ label: "GitHub", href: githubUrl }]}
    />
  );
}
