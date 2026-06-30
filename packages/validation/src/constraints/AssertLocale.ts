import { locales } from "@talosjs/translation";
import { Assert, createConstraint } from "../utils";

const AssertLocaleBase: ReturnType<typeof createConstraint> = createConstraint(
  () => Assert(`"${locales.join('" | "')}"`),
  "Locale must be a valid locale code",
);

export class AssertLocale extends AssertLocaleBase {}
