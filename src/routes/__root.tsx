import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "void — Your personal AI" },
      { name: "description", content: "A private AI workspace. Chat, voice, health insights, and live integrations." },
      { property: "og:title", content: "void — Your personal AI" },
      { name: "twitter:title", content: "void — Your personal AI" },
      { property: "og:description", content: "A private AI workspace. Chat, voice, health insights, and live integrations." },
      { name: "twitter:description", content: "A private AI workspace. Chat, voice, health insights, and live integrations." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e8764060-7408-4b3f-99ca-54b40342da5f/id-preview-ac587074--cfb04c33-9aca-4def-80fb-1d2e1b533ff0.lovable.app-1777781034113.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e8764060-7408-4b3f-99ca-54b40342da5f/id-preview-ac587074--cfb04c33-9aca-4def-80fb-1d2e1b533ff0.lovable.app-1777781034113.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: () => <Outlet />,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Toaster theme="dark" richColors position="top-center" />
        <Scripts />
      </body>
    </html>
  );
}
