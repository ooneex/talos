import { defineConfig } from "bunup";
import { copy } from "bunup/plugins";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/tools/BrightDataSearchTool.ts",
    "src/tools/ExaSearchTool.ts",
    "src/tools/FirecrawlSearchTool.ts",
    "src/tools/LinearIssueCreateTool.ts",
    "src/tools/LinearIssueDeleteTool.ts",
    "src/tools/LinearIssueUpdateTool.ts",
    "src/tools/LinearSearchTool.ts",
    "src/tools/PubMedSearchTool.ts",
    "src/tools/WikipediaSearchTool.ts",
  ],
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
