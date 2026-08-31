import { type ResolvedArticleLink, tokenizeWikiLinks } from "@rementum/contracts";
import GithubSlugger, { slug as headingSlug } from "github-slugger";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hProperties?: Record<string, unknown> };
}

export function ArticleMarkdown({
  body,
  links = [],
}: {
  body: string;
  links?: ResolvedArticleLink[];
}) {
  const wikiLinks = new Map(
    links.filter((link) => link.origin === "wiki").map((link) => [link.targetSlug, link]),
  );
  return (
    <ReactMarkdown
      components={{
        a({ className, children, href, node: _node, ...props }) {
          if (className?.includes("wiki-link-unresolved")) {
            return (
              <span className={className} title={props.title}>
                {children}
              </span>
            );
          }
          return (
            <a className={className} href={href} {...props}>
              {children}
            </a>
          );
        },
      }}
      remarkPlugins={[remarkGfm, remarkHeadingIds, createWikiLinksPlugin(body, wikiLinks)]}
      skipHtml
    >
      {body}
    </ReactMarkdown>
  );
}

function remarkHeadingIds() {
  return (tree: MarkdownNode) => {
    const slugger = new GithubSlugger();
    walk(tree, (node) => {
      if (!/^heading$/.test(node.type)) return;
      node.data = node.data ?? {};
      node.data.hProperties = {
        ...node.data.hProperties,
        id: slugger.slug(nodeText(node)),
      };
    });
  };
}

function createWikiLinksPlugin(body: string, links: Map<string, ResolvedArticleLink>) {
  return () => (tree: MarkdownNode) => {
    replaceTextNodes(tree, body, links);
  };
}

function replaceTextNodes(
  parent: MarkdownNode,
  source: string,
  links: Map<string, ResolvedArticleLink>,
): void {
  if (["link", "linkReference", "image", "imageReference"].includes(parent.type)) return;
  if (!parent.children) return;
  const children: MarkdownNode[] = [];
  for (const node of parent.children) {
    if (node.type !== "text" || typeof node.value !== "string") {
      replaceTextNodes(node, source, links);
      children.push(node);
      continue;
    }
    const tokens = tokenizeWikiLinks(node.value).filter(
      (token) => !tokenWasEscapedInSource(node, source, token.raw, token.start),
    );
    if (!tokens.length) {
      children.push(node);
      continue;
    }
    let offset = 0;
    for (const token of tokens) {
      if (token.start > offset) {
        children.push({ type: "text", value: node.value.slice(offset, token.start) });
      }
      const link = links.get(token.targetSlug);
      const label = token.label ?? token.target;
      if (link) {
        children.push({
          type: "link",
          url: `/articles/${link.articleId}${token.heading ? `#${headingSlug(token.heading)}` : ""}`,
          title: token.heading ? `${link.title} — ${token.heading}` : link.title,
          data: {
            hProperties: {
              className: ["wiki-link"],
              "data-wiki-target": token.targetSlug,
            },
          },
          children: [{ type: "text", value: label }],
        });
      } else {
        children.push({
          type: "link",
          url: `#unresolved-${token.targetSlug}`,
          title: `Unresolved article: ${token.targetSlug}`,
          data: {
            hProperties: {
              className: ["wiki-link", "wiki-link-unresolved"],
              "data-wiki-target": token.targetSlug,
              "aria-disabled": "true",
            },
          },
          children: [{ type: "text", value: label }],
        });
      }
      offset = token.end;
    }
    if (offset < node.value.length) {
      children.push({ type: "text", value: node.value.slice(offset) });
    }
  }
  parent.children = children;
}

function tokenWasEscapedInSource(
  node: MarkdownNode,
  source: string,
  token: string,
  valueOffset: number,
): boolean {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return false;
  const raw = source.slice(start, end);
  const rawIndex = raw.indexOf(token, Math.max(0, valueOffset - 1));
  if (rawIndex < 0) return false;
  let slashes = 0;
  for (let index = rawIndex - 1; index >= 0 && raw[index] === "\\"; index -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function walk(node: MarkdownNode, visit: (node: MarkdownNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function nodeText(node: MarkdownNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(nodeText).join("");
}
