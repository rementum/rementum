import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ArticleMarkdown({ body }: { body: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
      {body}
    </ReactMarkdown>
  );
}
