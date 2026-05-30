import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Deps are declared in package.json and installed at the consumer; don't
  // inline node_modules into the bundle (keeps dist small, lets npm dedupe).
  skipNodeModulesBundle: true,
});
