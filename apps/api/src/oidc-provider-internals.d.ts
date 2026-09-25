// oidc-provider has no API for extending a built-in grant, so oauth.ts wraps the refresh grant by
// importing its handler. The package has no exports map; the OAuth flow integration tests cover
// the path, so a provider upgrade that moves or reshapes this module fails there.
declare module "oidc-provider/lib/actions/grants/refresh_token.js" {
  import type { KoaContextWithOIDC } from "oidc-provider";

  export const grantType: string;
  export const parameters: Set<string>;
  export function handler(ctx: KoaContextWithOIDC): Promise<void>;
}
