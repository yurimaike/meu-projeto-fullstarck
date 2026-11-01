import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const requestedBuildTarget = process.env.SERVER_BUILD_TARGET;
const serverBuildTarget = requestedBuildTarget === "render" || requestedBuildTarget === "web" ? requestedBuildTarget : "fc";
const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

export default defineConfig({
  envDir: "../..",
  ssr: {
    noExternal: true
  },
  resolve: {
    alias: [
      { find: /^@libsql\/client$/, replacement: "@libsql/client/web" },
      { find: /^@repo\/shared\/http$/, replacement: fromRoot("packages/shared/src/http.ts") },
      { find: /^@repo\/shared$/, replacement: fromRoot("packages/shared/src/index.ts") }
    ]
  },
  build: {
    ssr: serverBuildTarget === "web" || serverBuildTarget === "render"
      ? "_core/fc-entry.web.ts"
      : "_core/fc-entry.ts",
    outDir: serverBuildTarget === "render" ? "dist-render" : "dist",
    emptyOutDir: true,
    target: "node20",
    rollupOptions: {
      output: {
        format: "es",
        entryFileNames: "index.js"
      }
    }
  }
});
