import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./ui/code-block";

export function DocsMarkdown({ body }: { body: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ pre: CodeBlock }}>
      {body}
    </ReactMarkdown>
  );
}
