import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    // Canonical port map: infra/ports.env (obs.ps1 exports OBS_WEB_PORT from it).
    port: Number(process.env["OBS_WEB_PORT"] ?? 3003),
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
