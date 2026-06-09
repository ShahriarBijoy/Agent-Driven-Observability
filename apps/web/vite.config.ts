import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    // Port map (PLAN.html): gateway 8080, grafana 3001, marquez 3002, web 3003.
    port: 3003,
  },
  plugins: [
    // Scoped to this app — the repo root tsconfig extends a workspace package
    // that tsconfck cannot resolve, and we only need the ~/* alias anyway.
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
  ],
});
