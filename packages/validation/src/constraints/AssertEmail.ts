import { Assert, createConstraint } from "../utils";

const AssertEmailBase: ReturnType<typeof createConstraint> = createConstraint(
  () => Assert("string.email"),
  "Must be a valid email address",
);

export class AssertEmail extends AssertEmailBase {}
