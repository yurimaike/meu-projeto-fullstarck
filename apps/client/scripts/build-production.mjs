import { spawnSync } from "node:child_process";
import { build, loadEnv } from "vite";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const outputDir = process.env.CLIENT_BUILD_OUT_DIR?.trim() || "dist-production";
const outputPath = resolve(process.cwd(), outputDir);
if (
  !outputDir ||
  outputDir.includes("/") ||
  outputDir.includes("\\") ||
  outputDir === "." ||
  outputDir === ".." ||
  dirname(outputPath) !== resolve(process.cwd())
) {
  throw new Error("CLIENT_BUILD_OUT_DIR must be a simple child directory of apps/client");
}
if (existsSync(outputPath)) {
  throw new Error(`Refusing to overwrite existing client build output: ${outputDir}`);
}
const envDir = resolve(process.cwd(), "../..");
const viteEnv = { ...loadEnv("production", envDir, "VITE_"), ...process.env };
const apiBaseUrl = viteEnv.VITE_API_BASE_URL?.trim();
const credentialLikePublicVars = Object.keys(viteEnv).filter(
  (key) => key.startsWith("VITE_") && /(SECRET|TOKEN|PASSWORD|PRIVATE_KEY)/i.test(key),
);

if (credentialLikePublicVars.length > 0) {
  throw new Error(`Remove credential-like VITE variables before building: ${credentialLikePublicVars.join(", ")}`);
}

if (!apiBaseUrl) {
  throw new Error("VITE_API_BASE_URL must be set to the HTTPS backend origin for a production build");
}

let parsedApiUrl;
try {
  parsedApiUrl = new URL(apiBaseUrl);
} catch {
  throw new Error("VITE_API_BASE_URL must be a valid HTTPS origin");
}

if (
  parsedApiUrl.protocol !== "https:" ||
  !parsedApiUrl.hostname ||
  parsedApiUrl.username ||
  parsedApiUrl.password ||
  parsedApiUrl.pathname !== "/" ||
  parsedApiUrl.search ||
  parsedApiUrl.hash
) {
  throw new Error("VITE_API_BASE_URL must be an HTTPS origin without path, query, or fragment");
}

await build({
  mode: "production",
  build: { outDir: outputDir },
});

const postbuild = spawnSync(process.execPath, ["scripts/postbuild.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    CLIENT_BUILD_OUT_DIR: outputDir,
    NODE_ENV: "production",
  },
});

if (postbuild.error) throw postbuild.error;
if (postbuild.status !== 0) process.exitCode = postbuild.status ?? 1;
