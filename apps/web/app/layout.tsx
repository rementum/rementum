import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { AppNavigation } from "../components/app-navigation";
import { PublicNav } from "../components/public-nav";
import { StickyBanner } from "../components/pui";
import { hasSession, publicAuthConfig, workspaceContext } from "../lib/api";
import { GITHUB_URL } from "../lib/site";
import "./globals.css";

// Fonts are vendored (Inter + JetBrains Mono, OFL) and loaded from disk so the production
// image builds without reaching Google Fonts. Both are variable, so one file spans every weight.
const inter = localFont({
  src: "./fonts/inter-variable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-variable.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Rementum",
    template: "%s | Rementum",
  },
  description: "One versioned brain behind every agent.",
};

// Deep Graphite / Ivory tint the browser chrome to match the surface behind the page.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#091514" },
  ],
};

// The static landing page cannot read cookies, so it ships the default theme. This runs while
// the HTML is still parsing so a light-theme visitor never sees a dark first paint; next/script's
// beforeInteractive would only run it from the client bootstrap, after the page is visible.
const themeInitializer = `
try {
  const entry = document.cookie.split("; ").find((value) => value.startsWith("rementum_theme="));
  const theme = entry?.slice("rementum_theme=".length);
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
} catch {}
`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("rementum_theme")?.value === "light" ? "light" : "dark";
  const sidebarCollapsed = cookieStore.get("rementum_sidebar")?.value === "collapsed";
  const signedIn = await hasSession();
  const context = signedIn ? await workspaceContext() : null;
  const authConfig = signedIn ? null : await publicAuthConfig();

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${inter.variable} ${jetbrainsMono.variable}${theme === "dark" ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: constant script above, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />
      </head>
      <body>
        {signedIn ? (
          <div className="min-h-dvh md:flex">
            <AppNavigation
              teams={context?.teams ?? []}
              workspaces={context?.workspaces ?? []}
              activeWorkspaceId={context?.activeWorkspace?.id ?? null}
              initialCollapsed={sidebarCollapsed}
            />
            <div className="min-w-0 flex-1">{children}</div>
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
              <a href={GITHUB_URL}>Free and self-hosted · star Rementum on GitHub</a>
            </StickyBanner>
            <PublicNav signupEnabled={authConfig?.signupEnabled ?? false} />
            {children}
          </div>
        )}
      </body>
    </html>
  );
}
