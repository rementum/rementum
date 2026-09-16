import type { Dictionary } from "../../lib/i18n/get-dictionary";
import { DOCS_URL } from "../../lib/site";
import { BrandMark } from "../brand";

export function LandingFooter({
  githubUrl,
  signupEnabled,
  signedIn = false,
  homeHref = "/",
  dict,
}: {
  githubUrl: string;
  signupEnabled: boolean;
  signedIn?: boolean;
  homeHref?: string;
  dict: Dictionary;
}) {
  const footer = dict.footer;
  const columns = [
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
      links: [
        {
          label: signedIn ? dict.common.dashboard : dict.common.signIn,
          href: signedIn ? "/dashboard" : "/auth/login",
        },
        ...(!signedIn && signupEnabled
          ? [{ label: dict.common.createAccount, href: "/register" }]
          : []),
        { label: footer.resetPassword, href: "/forgot-password" },
      ],
    },
  ];
  return (
    <footer className="border-line-strong border-t pt-10 pb-8">
      <div className="grid gap-10 sm:grid-cols-[1fr_2fr]">
        <div>
          <a
            href={homeHref}
            className="brand-link inline-flex items-center gap-2.5 font-semibold text-base text-ink tracking-tight"
          >
            <BrandMark className="size-7" /> Rementum
          </a>
          <p className="mt-4 text-ink-3 text-sm">{footer.tagline}</p>
        </div>
        <div className="grid grid-cols-2 gap-8 min-[440px]:grid-cols-3">
          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="mb-3 font-medium text-ink-3 text-xs">{column.heading}</h2>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-ink-2 text-sm hover:text-accent hover:underline"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <p className="mt-12 border-line border-t pt-5 font-mono text-ink-3 text-xs">
        {footer.bottom}
      </p>
    </footer>
  );
}
