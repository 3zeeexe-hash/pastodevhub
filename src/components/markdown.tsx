import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noreferrer noopener" /> }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
