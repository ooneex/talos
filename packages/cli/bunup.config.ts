import { defineConfig } from "bunup";
import { copy } from "bunup/plugins";

export default defineConfig({
  target: "bun",
  format: ["esm"],
  drop: ["console", "debugger"],
  packages: "bundle",
  external: [
    "@talosjs/command",
    "@talosjs/logger",
    "@talosjs/migrations",
    "@talosjs/seeds",
    "@talosjs/utils",
    "@talosjs/validation",
  ],
  sourcemap: "external",
  exports: true,
  minify: false,
  dts: {
    minify: false,
  },
  plugins: [copy(["../../LICENSE"]).to("../")],
});
