import { LandingPage } from "../components/landing-page";
import { landingMetadata } from "../lib/landing-metadata";

// This route deliberately sees empty cookies, including in the parent layout, so Next can serve
// one cached public landing page. Session-dependent rendering lives at /dashboard.
export const dynamic = "force-static";
export const revalidate = 60;
export const metadata = landingMetadata("en");

export default function Home() {
  return <LandingPage locale="en" />;
}
