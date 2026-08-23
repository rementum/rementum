import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";
import "./invite.css";
import "./management.css";

export const metadata: Metadata = {
  title: "Owl Memory",
  description: "One versioned brain behind every agent.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
            <Link href="/">Brains</Link>
            <Link href="/connections">Connections</Link>
            <a href="/docs">API</a>
            <Link href="/auth/logout">Sign out</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
