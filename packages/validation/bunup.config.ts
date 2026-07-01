import { defineConfig } from "bunup";
import { copy } from "bunup/plugins";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/constraints/AssertAppEnv.ts",
    "src/constraints/AssertChatQuery.ts",
    "src/constraints/AssertCountryCode.ts",
    "src/constraints/AssertCurrency.ts",
    "src/constraints/AssertDescription.ts",
    "src/constraints/AssertEmail.ts",
    "src/constraints/AssertFirstName.ts",
    "src/constraints/AssertHexaColor.ts",
    "src/constraints/AssertHostname.ts",
    "src/constraints/AssertId.ts",
    "src/constraints/AssertLastName.ts",
    "src/constraints/AssertLocale.ts",
    "src/constraints/AssertName.ts",
    "src/constraints/AssertPort.ts",
    "src/constraints/AssertUrl.ts",
    "src/constraints/AssertYoutubeUrl.ts",
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
