import { isLocalizedRoutePath } from "./i18n/locales";

// Which shell the root layout renders around a page.
//
// The marketing routes are served inside the *public* shell even to a signed-in visitor:
// the sidebar belongs to the app, and the landing page is not laid out for it. The layout
// cannot work that out on its own — it can read the session but not the pathname — so
// middleware.ts publishes the answer as a request header, exactly as it does for the
// locale. The header is set on the request and never reaches the client.
export const SURFACE_HEADER = "x-rementum-surface";

export const SURFACES = ["landing", "app"] as const;
export type Surface = (typeof SURFACES)[number];

// Closed-set parser, like parseLocale: a missing header resolves to "app" so an
// unprefixed request can never lose the sidebar, since the app is what every route
// except the marketing ones wants. Those always arrive with the header set.
export function parseSurface(value: string | null | undefined): Surface {
  return value === "landing" ? "landing" : "app";
}

// The routes that exist once per locale are exactly the marketing routes: "/" for English,
// "/zh" and "/tr" for the translated copies.
export function surfaceForPath(pathname: string): Surface {
  return isLocalizedRoutePath(pathname) ? "landing" : "app";
}
