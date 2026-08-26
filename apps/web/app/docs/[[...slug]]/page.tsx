import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsMarkdown } from "../../../components/docs-markdown";
import { IconArrowUpRight } from "../../../components/ui/icons";
import { DOC_PAGES, docHref, loadDoc } from "../../../lib/docs";
import { GITHUB_URL } from "../../../lib/site";

interface Props {
  params: Promise<{ slug?: string[] }>;
}

function slugOf(segments: string[] | undefined): string {
  return (segments ?? []).join("/");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = slugOf((await params).slug);
  const page = DOC_PAGES.find((entry) => entry.slug === slug);
  return { title: page ? `${page.title} · Docs` : "Docs" };
}

export default async function DocsPage({ params }: Props) {
  const slug = slugOf((await params).slug);
  const doc = await loadDoc(slug);
  if (!doc) notFound();

  const groups: Array<{ group: string; pages: typeof DOC_PAGES }> = [];
  for (const page of DOC_PAGES) {
    const bucket = groups.at(-1);
    if (bucket && bucket.group === page.group) bucket.pages.push(page);
    else groups.push({ group: page.group, pages: [page] });
  }
  const index = DOC_PAGES.findIndex((page) => page.slug === slug);
  const previous = index > 0 ? DOC_PAGES[index - 1] : null;
  const next = index < DOC_PAGES.length - 1 ? DOC_PAGES[index + 1] : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="self-start lg:sticky lg:top-20">
          <nav aria-label="Documentation" className="flex flex-col gap-5">
            {groups.map(({ group, pages }) => (
              <div key={group}>
                <p className="mb-1.5 font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
                  {group}
                </p>
                <ul className="flex flex-col border-l border-line">
                  {pages.map((page) => {
                    const active = page.slug === slug;
                    return (
                      <li key={page.file}>
                        <Link
                          aria-current={active ? "page" : undefined}
                          className={`-ml-px block border-l py-1 pl-3 text-sm transition-colors ${
                            active
                              ? "border-accent font-medium text-ink"
                              : "border-transparent text-ink-2 hover:border-line-strong hover:text-ink"
                          }`}
                          href={docHref(page)}
                        >
                          {page.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <p className="mb-4 border-b border-dashed border-line pb-2 font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
            Docs · {doc.page.group}
          </p>
          <article className="markdown">
            <DocsMarkdown body={doc.body} />
          </article>
          <footer className="mt-10 border-t border-dashed border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {previous ? (
                <Link
                  className="text-sm font-medium text-ink-2 transition-colors hover:text-ink"
                  href={docHref(previous)}
                >
                  ← {previous.title}
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link
                  className="text-sm font-medium text-ink-2 transition-colors hover:text-ink"
                  href={docHref(next)}
                >
                  {next.title} →
                </Link>
              ) : (
                <span />
              )}
            </div>
            <a
              className="mt-3 inline-flex items-center gap-1 font-mono text-2xs text-ink-3 transition-colors hover:text-ink"
              href={`${GITHUB_URL}/edit/main/docs/${doc.page.file}`}
              target="_blank"
              rel="noreferrer"
            >
              Edit this page on GitHub <IconArrowUpRight />
            </a>
          </footer>
        </div>
      </div>
    </main>
  );
}
