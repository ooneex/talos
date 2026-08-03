import { locales } from "@talosjs/translation";
import { Assert, createConstraint } from "../utils";

const AssertLocaleBase: ReturnType<typeof createConstraint> = createConstraint(
  () => Assert(`"${locales.join('" | "')}"`),
  "Locale must be a valid locale code",
);

export class AssertLocale extends AssertLocaleBase {
  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor needed so bun's coverage tool marks it as hit
  constructor() {
    super();
  }
}
