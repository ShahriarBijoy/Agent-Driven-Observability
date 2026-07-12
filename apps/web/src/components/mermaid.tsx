import { useState } from "react";
import { themeStore } from "~/lib/theme";
import { useMountEffect } from "~/lib/use-mount-effect";

let renderSeq = 0;

const RENDER_DEBOUNCE_MS = 200;

/**
 * Inner renderer: one async mermaid render per mount. The outer component
 * remounts it (key) on theme or source change, so no effect dependencies are
 * needed. mermaid itself is dynamically imported to keep it out of the main
 * bundle; SSR and first client paint both show the placeholder.
 */
function MermaidSvg({ chart, dark }: { chart: string; dark: boolean }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useMountEffect(() => {
    let cancelled = false;
    void (async () => {
      // Debounce: the outer key remounts this component on every source
      // change, so while a fence streams in, instances live only a few ms
      // and unmount (cancelled) before the wait ends. Only a source that
      // stays stable this long pays for a full mermaid parse + layout.
      await new Promise((resolve) => setTimeout(resolve, RENDER_DEBOUNCE_MS));
      if (cancelled) return;
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          // Without this, failed renders (e.g. a fence mid-stream) leak the
          // bomb "Syntax error in text" SVG into document.body.
          suppressErrorRendering: true,
          theme: dark ? "dark" : "neutral",
          fontFamily: "inherit",
        });
        const rendered = await mermaid.render(`mmd-${renderSeq++}`, chart);
        if (!cancelled) setSvg(rendered.svg);
      } catch {
        // Not (yet) valid mermaid — e.g. a fence still streaming in. Show source.
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  if (failed) {
    return (
      <pre>
        <code>{chart}</code>
      </pre>
    );
  }
  if (svg === null) {
    return <div className="py-2 text-xs text-muted-foreground">Rendering diagram…</div>;
  }
  return (
    <div
      className="typeset-scroll my-4 [&_svg]:mx-auto [&_svg]:max-w-full"
      // eslint-disable-next-line react/no-danger — mermaid output, securityLevel: strict
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function Mermaid({ chart }: { chart: string }) {
  const theme = themeStore.use();
  return <MermaidSvg key={`${theme}:${chart}`} chart={chart} dark={theme === "dark"} />;
}
