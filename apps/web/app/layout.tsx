import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { AppNavigation } from "../components/app-navigation";
import { BrandMark } from "../components/brand";
import { ThemeToggle } from "../components/ui/theme-toggle";
import { hasSession, publicAuthConfig, workspaceContext } from "../lib/api";
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
          <div className="public-site">
            <header className="public-nav">
              <Link className="brand" href="/">
                <BrandMark className="brand-mark" />
                <span>Rementum</span>
              </Link>
              <ThemeToggle />
              <Link className="nav-action" href="/auth/login">
                Sign in
              </Link>
              {authConfig?.signupEnabled ? (
                <Link className="nav-action" href="/register">
                  Create account
                </Link>
              ) : null}
            </header>
            {children}
          </div>
        )}
      </body>
    </html>
  );
}
