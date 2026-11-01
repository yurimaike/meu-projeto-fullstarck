import { spawnSync } from "node:child_process";

const outputDir = process.env.CLIENT_BUILD_OUT_DIR?.trim() || "dist";

const steps = [
  ["sitemap-routes", ["node", "scripts/generate-sitemap-routes.mjs", "--output", `${outputDir}/sitemap-routes.json`]],
  ["prerender", ["node", "scripts/prerender.mjs"]],
];

for (const [name, command] of steps) {
  const [bin, ...args] = command;
  const result = spawnSync(bin, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      CLIENT_BUILD_OUT_DIR: outputDir,
      NODE_ENV: "production",
    },
  });

  if (result.status !== 0) {
    const exitCode = result.status ?? "unknown";
    console.warn(`[postbuild] ${name} skipped or failed with exit code ${exitCode}`);
    break;
  }
}
