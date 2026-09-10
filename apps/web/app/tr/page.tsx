import { LandingPage } from "../../components/landing-page";
import { landingMetadata } from "../../lib/landing-metadata";

export const dynamic = "force-static";
export const revalidate = 60;
export const metadata = landingMetadata("tr");

export default function HomeTr() {
  return <LandingPage locale="tr" />;
}
