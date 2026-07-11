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
          // in code-block styling. Decided from the hast node: the child code
          // element's className is known before React invokes any renderer.
          pre: ({ node, children: pre, ...props }) => {
            const codeNode = node?.children[0];
            const isMermaid =
              codeNode?.type === "element" &&
              Array.isArray(codeNode.properties.className) &&
              codeNode.properties.className.includes("language-mermaid");
            if (isMermaid) return <>{pre}</>;
            return <pre {...props}>{pre}</pre>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
