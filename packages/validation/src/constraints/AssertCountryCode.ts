import { Assert, createConstraint } from "../utils";

const AssertCountryCodeBase: ReturnType<typeof createConstraint> = createConstraint(
  () => Assert("2 <= string <= 2 & /^[A-Z]{2}$/"),
  "Country code must be a 2-character uppercase ISO 3166-1 alpha-2 code",
);

export class AssertCountryCode extends AssertCountryCodeBase {
  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor needed so bun's coverage tool marks it as hit
  constructor() {
    super();
  }
}
