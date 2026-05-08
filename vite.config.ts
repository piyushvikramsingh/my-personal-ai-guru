// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

// The Lovable componentTagger ("lovable-plugin") intercepts react/jsx-dev-runtime and
// replaces it with a virtual module whose jsxDEV wrapper checks:
//
//   const _isBrowser = typeof window !== "undefined";
//
// On the server (SSR), _isBrowser = false → passes through to real jsxDEV.
// On the client, _isBrowser = true → wraps props with ref callbacks that store source info.
//
// The ref-prop additions change the React element (even if no DOM attribute is written),
// which causes React 19's strict hydration to detect a mismatch between the server-rendered
// tree and the initial client render → "Hydration failed" + "Invalid hook call" on first load.
//
// Fix strategy: patch the tagger's own load hook after config is resolved ("configResolved").
// This runs after all plugins are ordered, bypassing the plugin-ordering problem, and wraps
// the tagger's load to replace `_isBrowser = typeof window !== "undefined"` with
// `_isBrowser = false` so both SSR and client use the same pass-through jsxDEV.
function fixSSRHydrationPlugin(): Plugin {
  const TAGGER_VIRTUAL_ID = "\0jsx-source/jsx-dev-runtime";
  const PATTERN = 'const _isBrowser = typeof window !== "undefined"';
  const REPLACEMENT = "const _isBrowser = false";

  return {
    name: "fix-ssr-hydration-tagger",
    // configResolved runs after all plugins are merged — we can safely mutate the tagger here.
    configResolved(config) {
      const tagger = config.plugins.find((p) => p.name === "lovable-plugin");
      if (!tagger) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalLoad = (tagger as any).load as
        | ((id: string) => string | null | undefined)
        | undefined;
      if (!originalLoad) return;

      // Replace the tagger's load hook with our patched version.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (tagger as any).load = function (this: unknown, id: string) {
        const result = originalLoad.call(this, id);
        if (id !== TAGGER_VIRTUAL_ID || !result) return result;

        const code = typeof result === "string" ? result : (result as { code: string }).code;
        return code.includes(PATTERN) ? code.replace(PATTERN, REPLACEMENT) : result;
      };
    },
  };
}

export default defineConfig({
  plugins: [fixSSRHydrationPlugin()],
  vite: {
    optimizeDeps: {
      include: ["react/jsx-dev-runtime"],
    },
    server: {
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: true,
    },
  },
});
