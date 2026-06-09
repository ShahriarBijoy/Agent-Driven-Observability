import ReactMarkdown from "react-markdown";

/** Markdown rendering for postmortems, artifacts, and runbooks. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md-body text-sm leading-relaxed text-ink-dim">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
