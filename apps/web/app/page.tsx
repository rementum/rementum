import { Dashboard } from "../components/dashboard";
import { Architecture } from "../components/landing/architecture";
import { CapabilityMarquee } from "../components/landing/capability-marquee";
import { ConnectTeaser } from "../components/landing/connect-teaser";
import { CTASection } from "../components/landing/cta";
import { FeatureGrid } from "../components/landing/feature-grid";
import { LandingFooter } from "../components/landing/footer";
import { Hero } from "../components/landing/hero";
import { MotionProvider } from "../components/landing/motion-provider";
import { ScrollProgress } from "../components/landing/scroll-progress";
import { SectionHead } from "../components/landing/section-head";
import { StatsBand } from "../components/landing/stats";
import { Stepper } from "../components/landing/stepper";
import { GradientText } from "../components/pui";
import { hasSession, publicAuthConfig } from "../lib/api";
import { GITHUB_URL } from "../lib/site";

export default async function Home() {
  if (!(await hasSession())) return <Landing />;
  return <Dashboard />;
}

async function Landing() {
  const authConfig = await publicAuthConfig();
  return (
    <main className="relative">
      <MotionProvider>
        <ScrollProgress />
        <Hero githubUrl={GITHUB_URL} />
        <CapabilityMarquee />
        <StatsBand />
        <WorkflowLanding />
        <FeatureGrid />
        <Architecture />
        <ConnectTeaser />
        <CTASection githubUrl={GITHUB_URL} />
        <LandingFooter githubUrl={GITHUB_URL} signupEnabled={authConfig.signupEnabled} />
      </MotionProvider>
    </main>
  );
}

function WorkflowLanding() {
  const steps = [
    {
      code: "route",
      title: "Find the right article.",
      body: "Agents read a compact index of titles, summaries, keywords, and freshness to choose one article.",
    },
    {
      code: "read",
      title: "Load current canon.",
      body: "The full article is opened only after the index identifies it. The rest of the brain stays untouched.",
    },
    {
      code: "stage",
      title: "Analyze and stage the memory.",
      body: "Rementum stages the submitted knowledge immediately, then an opted-in workspace can compact the promoted title, summary, and body in the background.",
    },
    {
      code: "promote",
      title: "Keep the history.",
      body: "Rementum creates an immutable version and records an audit event when a write is promoted.",
    },
  ];

  return (
    <section
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-20"
      id="workflow"
      tabIndex={-1}
    >
      <SectionHead
        kicker="The write path"
        title={
          <>
            Load the right <GradientText>context</GradientText>.
          </>
        }
      >
        Agents read a compact index, open the relevant article, and leave the rest of the brain
        untouched. Every change is staged before it lands.
      </SectionHead>
      <Stepper steps={steps} />
    </section>
  );
}
