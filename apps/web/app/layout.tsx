import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import Link from "next/link";
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
        <header className="topbar">
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              O
            </span>
            <span>Owl Memory</span>
          </Link>
          <nav aria-label="Primary navigation">
            {signedIn ? (
              <>
                <Link href="/">Brains</Link>
                <Link href="/connections">Connections</Link>
                <a href="/docs">API</a>
                <form action="/auth/logout" method="post" className="nav-logout">
                  <button type="submit">Sign out</button>
                </form>
              </>
            ) : (
              <Link href="/auth/login">Sign in</Link>
            )}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
