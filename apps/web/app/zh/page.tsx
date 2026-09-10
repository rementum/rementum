import { LandingPage } from "../../components/landing-page";
import { landingMetadata } from "../../lib/landing-metadata";

export const dynamic = "force-static";
export const revalidate = 60;
export const metadata = landingMetadata("zh");

export default function HomeZh() {
  return <LandingPage locale="zh" />;
}
