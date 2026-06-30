import { defineConfig } from "bunup";
import { copy } from "bunup/plugins";

export default defineConfig({
  entry: [
    "src/capitalize.ts",
    "src/dataURLtoFile.ts",
    "src/formatRelativeNumber.ts",
    "src/millisecondsToHMS.ts",
    "src/parseEnvVars.ts",
    "src/parseString.ts",
    "src/random.ts",
    "src/secondsToHMS.ts",
    "src/secondsToMS.ts",
    "src/sleep.ts",
    "src/splitToWords.ts",
    "src/toCamelCase.ts",
    "src/toKebabCase.ts",
    "src/toPascalCase.ts",
    "src/toSnakeCase.ts",
    "src/trans.ts",
    "src/trim.ts",
  ],
  target: "browser",
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
