import { isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import { Mermaid } from "~/components/mermaid";
import { cn } from "~/lib/utils";

/**
 * Markdown rendering on the shadcn typeset system — postmortems, artifacts,
 * runbooks, and chat. Pass a preset class (`typeset-docs`, `typeset-chat`)
 * to set the rhythm for the surface. ```mermaid fences render as diagrams.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("typeset", className)}>
      <ReactMarkdown
        components={{
          table: ({ node: _node, ...props }) => (
            <div className="typeset-scroll">
              <table {...props} />
            </div>
          ),
          code: ({ node: _node, className: codeClass, children: code, ...props }) => {
            if (codeClass?.includes("language-mermaid") === true) {
              return <Mermaid chart={String(code).replace(/\n$/, "")} />;
            }
            return (
              <code className={codeClass} {...props}>
                {code}
              </code>
            );
          },
          // Unwrap the <pre> around mermaid fences so the diagram isn't boxed
          // in code-block styling; all other pre blocks are untouched.
          pre: ({ node: _node, children: pre, ...props }) => {
            const only = Array.isArray(pre) ? pre[0] : pre;
            if (isValidElement(only) && only.type === Mermaid) return only;
            return <pre {...props}>{pre}</pre>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
