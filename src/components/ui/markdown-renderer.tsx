import Markdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";

export const sharedMarkdownRehypePlugins = [rehypeRaw];

export const sharedMarkdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-bold mt-8 mb-4 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold mt-6 mb-3">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-medium mt-5 mb-2">{children}</h3>,
  pre: ({ children }) => (
    <pre className="my-4 p-4 rounded-lg bg-black/5 dark:bg-white/5 overflow-x-auto font-mono text-sm max-w-full whitespace-pre-wrap wrap-break-word">
      {children}
    </pre>
  ),
  code: ({ children }) => <code>{children}</code>,
  blockquote: ({ children }) => <blockquote className="my-4 pl-4 border-l-4 border-current/20 italic opacity-90">{children}</blockquote>,
  ul: ({ children }) => <ul className="my-4 pl-6 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 pl-6 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  p: ({ children }) => <p className="reader-paragraph">{children}</p>,
};

interface SharedMarkdownRendererProps {
  content: string;
  components?: Components;
}

export function SharedMarkdownRenderer({ content, components }: SharedMarkdownRendererProps) {
  return (
    <Markdown rehypePlugins={sharedMarkdownRehypePlugins} components={components ?? sharedMarkdownComponents}>
      {content}
    </Markdown>
  );
}
