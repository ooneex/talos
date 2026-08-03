import { Environment } from "@talosjs/app-env";
import { Assert, createConstraint } from "../utils";

const environments: string[] = Object.values(Environment);

const AssertAppEnvBase: ReturnType<typeof createConstraint> = createConstraint(
  () => Assert(`"${environments.join('" | "')}"`),
  `Must be a valid environment (${environments.join(", ")})`,
);

export class AssertAppEnv extends AssertAppEnvBase {
  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor needed so bun's coverage tool marks it as hit
  constructor() {
    super();
  }
}
