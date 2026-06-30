import { Assert, createConstraint } from "../utils";

const AssertDescriptionBase: ReturnType<typeof createConstraint> = createConstraint(
  () => Assert("1 <= string <= 5000"),
  "Description must be between 1 and 5000 characters",
);

export class AssertDescription extends AssertDescriptionBase {}
