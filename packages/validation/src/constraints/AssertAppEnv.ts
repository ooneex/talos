import { Environment } from "@talosjs/app-env";
import { Assert, createConstraint } from "../utils";

const environments: string[] = Object.values(Environment);

const AssertAppEnvBase: ReturnType<typeof createConstraint> = createConstraint(
  () => Assert(`"${environments.join('" | "')}"`),
  `Must be a valid environment (${environments.join(", ")})`,
);

export class AssertAppEnv extends AssertAppEnvBase {}
