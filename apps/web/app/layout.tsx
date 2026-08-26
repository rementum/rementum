import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppNavigation } from "../components/app-navigation";
import { PublicNav } from "../components/public-nav";
import { StickyBanner } from "../components/pui";
import { hasSession, publicAuthConfig, workspaceContext } from "../lib/api";
import { GITHUB_URL } from "../lib/site";
import "./globals.css";
import "./styles.css";
import "./invite.css";
import "./management.css";
import "./dashboard.css";

export const metadata: Metadata = {
  title: {
    default: "Rementum",
    template: "%s | Rementum",
  },
  description: "One versioned brain behind every agent.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("rementum_theme")?.value === "light" ? "light" : "dark";
  const signedIn = await hasSession();
  const context = signedIn ? await workspaceContext() : null;
  const authConfig = signedIn ? null : await publicAuthConfig();

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${GeistSans.variable} ${GeistMono.variable}${theme === "dark" ? " dark" : ""}`}
    >
      <body>
        {signedIn ? (
          <div className="workspace">
            <AppNavigation
              teams={context?.teams ?? []}
              workspaces={context?.workspaces ?? []}
              activeWorkspaceId={context?.activeWorkspace?.id ?? null}
            />
            <div className="workspace-main">{children}</div>
          </div>
        ) : (
          <div className="flex min-h-dvh flex-col">
            <StickyBanner
              trailing={
                <span aria-hidden="true" className="ml-1">
                  →
                </span>
              }
            >
              <a href={GITHUB_URL}>Open source under AGPL-3.0 — star Rementum on GitHub</a>
            </StickyBanner>
            <PublicNav signupEnabled={authConfig?.signupEnabled ?? false} />
            {children}
          </div>
        )}
      </body>
    </html>
  );
}
