import { createLocalStore } from "./store";

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const themeStore = createLocalStore<Theme>("obs-lab.theme", "dark", THEMES);

/**
 * Inline-script source that applies the stored theme before first paint so a
 * light-mode reload never flashes dark (and vice versa). Defaults to dark,
 * the lab's historical mode.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("obs-lab.theme");if(t!=="light")document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}})()`;
