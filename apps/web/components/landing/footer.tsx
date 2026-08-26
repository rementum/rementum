"use client";

import { BigBack } from "../pui";

export function LandingFooter({ githubUrl }: { githubUrl: string }) {
  return (
    <BigBack
      company="Rementum"
      copyright="Open source under AGPL-3.0"
      columns={[
        {
          heading: "Product",
          links: [
            { label: "How it works", href: "#workflow" },
            { label: "Features", href: "#features" },
            { label: "Architecture", href: "#architecture" },
            { label: "Connect an agent", href: "#connect" },
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
            { label: "Create account", href: "/register" },
            { label: "Reset password", href: "/forgot-password" },
          ],
        },
      ]}
      social={[{ label: "GitHub", href: githubUrl }]}
    />
  );
}
