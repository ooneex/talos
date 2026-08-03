import { Assert, createConstraint } from "../utils";

const AssertPortBase: ReturnType<typeof createConstraint> = createConstraint(
  () => Assert("1 <= number.integer <= 65535"),
  "Must be a valid port number (1-65535)",
);

export class AssertPort extends AssertPortBase {
  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor needed so bun's coverage tool marks it as hit
  constructor() {
    super();
  }
}
