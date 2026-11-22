import { execSync } from "node:child_process";
import { defineConfig } from "vite";

const build = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
})();

// base "./": every URL is relative, so dist/ works from any path on any static host.
export default defineConfig({
  root: "web",
  base: "./",
  define: { __BUILD__: JSON.stringify(build) },
  build: { outDir: "../dist", emptyOutDir: true },
  server: { port: Number(process.env.PORT ?? 5175), host: true },
});
