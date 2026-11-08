import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Shared between Windows and Android; native HTML is deliberately disabled. */
export function ChatMarkdown({ text, onOpenLink }: {
  text: string;
  onOpenLink?: (url: string) => void | Promise<void>;
}) {
  return <div className="markdown-text">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      a: ({ href, children }) => <a href={href} onClick={event => {
        event.preventDefault();
        if (href) void onOpenLink?.(href);
      }}>{children}</a>
    }}>{text}</ReactMarkdown>
  </div>;
}
