import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// The page's Content-Security-Policy allows images from this origin only, and articles
// hold no images of their own. A remote image would otherwise report every reader's
// address to whoever planted it, so it is shown as a link the reader can choose to open.
function ImageLink({ src, alt }: { src?: string | Blob; alt?: string }) {
  const href = typeof src === "string" ? src : "";
  const label = alt?.trim() || href;
  return (
    <a
      className="text-accent underline decoration-dotted underline-offset-2"
      href={href}
      rel="noreferrer noopener nofollow"
      target="_blank"
    >
      {label}
    </a>
  );
}

export function ArticleMarkdown({ body }: { body: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: ImageLink }}>
      {body}
    </ReactMarkdown>
  );
}
