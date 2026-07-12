import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { themeStore } from "~/lib/theme";

export function ThemeToggle() {
  const theme = themeStore.use();

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    themeStore.set(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
