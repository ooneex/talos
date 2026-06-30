import { defineConfig } from "bunup";
import { copy } from "bunup/plugins";

export default defineConfig({
  entry: ["src/index.ts"],
  target: "bun",
  format: ["esm"],
  drop: ["console", "debugger"],
  packages: "external",
  sourcemap: "external",
  unused: {
    level: "error",
  },
  exports: false,
  minify: false,
  dts: {
    minify: false,
  },
  plugins: [copy(["../../LICENSE"]).to("../")],
});
