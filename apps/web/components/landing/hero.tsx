import type { Dictionary } from "../../lib/i18n/get-dictionary";
import { DOCS_URL } from "../../lib/site";
import { ArticleMarkdown } from "../article-markdown";
import { IconArrowUpRight, IconBook, IconBrains, IconCheck, IconGitHub } from "../ui/icons";
import { StatusPill } from "../ui/status-pill";

export function Hero({
  githubUrl,
  dict,
  signedIn = false,
}: {
  githubUrl: string;
  dict: Dictionary;
  signedIn?: boolean;
}) {
  const hero = dict.hero;
  const exampleBody = `${hero.exampleBodyA}\n\n**${hero.exampleBodyB}**`;
  return (
    <section className="pt-12 pb-12 sm:pt-16 md:pb-20">
      <div className="mx-auto max-w-[800px] text-center">
        <p className="mb-6 inline-flex items-center gap-2.5 text-accent text-xs font-medium">
          <IconBrains /> {hero.kicker}
        </p>
        <h1 className="text-balance font-medium text-[clamp(40px,5.3vw,72px)] text-ink leading-[1.05] tracking-tighter">
          {hero.titleA} <span className="block">{hero.titleB}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-[56ch] text-pretty text-ink-2 text-lg leading-relaxed">
          {hero.subtitle}
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <a
            href={signedIn ? "/dashboard" : "/auth/login"}
            className="action-link action-link-primary pressable min-h-11 px-5"
          >
            {signedIn ? dict.common.dashboard : hero.getStarted} <IconArrowUpRight />
          </a>
          <a href={githubUrl} className="action-link bg-surface pressable min-h-11">
            <IconGitHub /> {hero.starOnGithub}
          </a>
        </div>
      </div>

      <figure className="example-article mx-auto mt-12 max-w-[1120px] sm:mt-14">
        <div className="product-preview overflow-hidden rounded-window bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-line border-b bg-canvas/50 px-5 py-3.5 text-xs sm:px-6">
            <span className="flex items-center gap-2.5 font-medium text-ink">
              <IconBrains className="text-accent" />
              {hero.workspaceName}
            </span>
            <span className="text-ink-3">{hero.sampleWorkspace}</span>
          </div>
          <div className="grid md:grid-cols-[190px_minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)_220px]">
            <div className="border-line border-b bg-canvas/35 p-4 md:border-r md:border-b-0">
              <p className="mb-3 px-2 text-ink-3 text-xs">{hero.indexLabel}</p>
              <ul className="grid gap-1 sm:grid-cols-3 md:grid-cols-1">
                {[hero.exampleTitle, ...hero.sampleTopics].map((title, index) => (
                  <li
                    key={title}
                    className={`flex items-start gap-2.5 rounded-control px-2.5 py-2.5 text-xs leading-relaxed ${index === 0 ? "bg-accent-tint font-medium text-accent" : "text-ink-3"}`}
                  >
                    <IconBook className="mt-0.5 shrink-0" />
                    <span>{title}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0 p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-ink-3 text-xs">{hero.examplePath}</p>
                <StatusPill status="current" label={hero.currentLabel} />
              </div>
              <h2 className="mt-6 font-semibold text-[23px] text-ink tracking-tight">
                {hero.exampleTitle}
              </h2>
              <p className="mt-2 text-ink-3 text-xs">{hero.exampleVersion}</p>
              <div className="markdown mt-6">
                <ArticleMarkdown body={exampleBody} />
              </div>
            </div>
            <aside className="grid gap-7 border-line border-t bg-canvas/20 p-6 sm:grid-cols-2 md:col-span-2 lg:col-span-1 lg:block lg:border-t-0 lg:border-l">
              <div>
                <p className="text-ink-3 text-xs">{hero.latestChange}</p>
                <div className="mt-4 flex items-center gap-2 text-green text-xs font-medium">
                  <IconCheck />
                  {hero.promotedLabel}
                </div>
                <p className="mt-2 text-ink-2 text-sm leading-relaxed">{hero.latestChangeNote}</p>
              </div>
              <div className="lg:mt-8 lg:border-line lg:border-t lg:pt-5">
                <p className="text-ink-3 text-xs">{hero.versionHistory}</p>
                <ol className="mt-4 space-y-4">
                  {hero.versionNotes.map((note, index) => (
                    <li key={note} className="flex items-start gap-3 text-xs leading-relaxed">
                      <span className={`font-mono ${index === 0 ? "text-accent" : "text-ink-3"}`}>
                        v{3 - index}
                      </span>
                      <span className={index === 0 ? "text-ink" : "text-ink-3"}>{note}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          </div>
        </div>
        <figcaption className="mx-auto mt-5 max-w-xl text-center text-ink-3 text-xs leading-relaxed">
          {hero.caption}
        </figcaption>
      </figure>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 text-center text-ink-3 text-xs sm:mt-12">
        <p>{hero.clients}</p>
        <a
          href={DOCS_URL}
          className="inline-flex min-h-9 items-center gap-1.5 text-ink-2 hover:text-accent"
        >
          {hero.readDocs}
          <IconArrowUpRight />
        </a>
      </div>
    </section>
  );
}
