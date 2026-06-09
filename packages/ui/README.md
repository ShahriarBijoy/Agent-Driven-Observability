# @obs/ui

Design tokens and React primitives for the control plane.

- `styles/tokens.css` — the lab palette (warm off-black, sodium signal amber,
  parchment ink) as CSS variables, mapped into Tailwind v4 via `@theme inline`.
  This file is the single source of truth for color, type, radius, shadow.
- `src/` — shadcn-style primitives (Button, Badge, Card, Table, Select, …)
  built with class-variance-authority on top of the tokens.

Consumers import the CSS once (`@import "@obs/ui/styles/tokens.css"` in the
app stylesheet, plus a Tailwind `@source` pointing at this package's `src/`)
and the components from `@obs/ui`.
