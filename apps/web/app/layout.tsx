import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import Link from "next/link";
import { AppNavigation } from "../components/app-navigation";
import { hasSession } from "../lib/api";
import "./styles.css";
import "./invite.css";
import "./management.css";

export const metadata: Metadata = {
  title: "Owl Memory",
  description: "One versioned brain behind every agent.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const signedIn = await hasSession();

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        {signedIn ? (
          <div className="workspace">
            <AppNavigation />
            <div className="workspace-main">{children}</div>
          </div>
        ) : (
          <div className="public-site">
            <header className="public-nav">
              <Link className="brand" href="/">
                <span className="brand-mark" aria-hidden="true">
                  O
                </span>
                <span>Owl Memory</span>
              </Link>
              <Link className="nav-action" href="/auth/login">
                Sign in
              </Link>
            </header>
            {children}
          </div>
        )}
      </body>
    </html>
  );
}
