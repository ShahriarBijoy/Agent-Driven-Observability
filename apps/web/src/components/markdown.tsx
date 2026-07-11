import ReactMarkdown from "react-markdown";
import { cn } from "~/lib/utils";

/**
 * Markdown rendering on the shadcn typeset system — postmortems, artifacts,
 * runbooks, and chat. Pass a preset class (`typeset-docs`, `typeset-chat`)
 * to set the rhythm for the surface.
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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
