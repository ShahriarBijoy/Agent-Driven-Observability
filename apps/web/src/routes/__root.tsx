import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ApprovalToaster } from "~/components/approval-toaster";
import { NavRail } from "~/components/nav-rail";
import { TopBar } from "~/components/top-bar";
import { TooltipProvider } from "~/components/ui/tooltip";
import { THEME_INIT_SCRIPT } from "~/lib/theme";
import appCss from "~/styles.css?url";
import "~/lib/rum";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "obs·lab — control plane" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <TooltipProvider>
        <ApprovalToaster />
        <div className="flex h-dvh flex-col">
          <TopBar />
          <div className="flex min-h-0 flex-1">
            <NavRail />
            <main className="min-w-0 flex-1 overflow-y-auto">
              <Outlet />
            </main>
          </div>
        </div>
      </TooltipProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The theme init script toggles the `dark` class before hydration, so the
    // server-rendered <html> attributes legitimately differ from the client's.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint — no light/dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
