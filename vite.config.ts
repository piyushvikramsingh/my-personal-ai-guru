// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

// The Lovable componentTagger intercepts react/jsx-dev-runtime and replaces it with
// a virtual module containing `const _isBrowser = typeof window !== "undefined"`.
// This adds data-* attributes to React elements ONLY on the client, not during SSR,
// causing every element to differ between server and client → hydration mismatch.
//
// Fix: patch the tagger's virtual module in the transform hook to always use
// _isBrowser = false, making server and client renders identical.
function fixSSRHydrationPlugin(): Plugin {
  const TAGGER_VIRTUAL_ID = "\0jsx-source/jsx-dev-runtime";
  return {
    name: "fix-ssr-hydration-tagger",
    enforce: "post",
    transform(code, id) {
      if (id === TAGGER_VIRTUAL_ID) {
        const patched = code.replace(
          'const _isBrowser = typeof window !== "undefined"',
          "const _isBrowser = false",
        );
        if (patched === code) {
          console.warn("[fix-ssr-hydration] WARNING: pattern not found in", id);
        } else {
          console.log("[fix-ssr-hydration] Patched _isBrowser in", id);
        }
        return patched;
      }
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
