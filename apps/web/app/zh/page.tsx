import { LandingPage } from "../../components/landing-page";
import { landingMetadata } from "../../lib/landing-metadata";

// Cached with ISR, deliberately not force-static: the root layout reads this route's
// locale from the middleware header. See the comment in app/page.tsx.
export const revalidate = 60;
export const metadata = landingMetadata("zh");

export default function HomeZh() {
  return <LandingPage locale="zh" />;
}
