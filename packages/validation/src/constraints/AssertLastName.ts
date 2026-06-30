import { Assert, createConstraint } from "../utils";

const AssertLastNameBase: ReturnType<typeof createConstraint> = createConstraint(
  () => Assert("1 <= string <= 50 & /^[a-zA-Z\\s'-]+$/"),
  "Last name must be between 1 and 50 characters and contain only letters, spaces, hyphens, and apostrophes",
);

export class AssertLastName extends AssertLastNameBase {}
