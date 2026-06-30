import { Assert, createConstraint } from "../utils";

const AssertFirstNameBase: ReturnType<typeof createConstraint> = createConstraint(
  () => Assert("1 <= string <= 50 & /^[a-zA-Z\\s'-]+$/"),
  "First name must be between 1 and 50 characters and contain only letters, spaces, hyphens, and apostrophes",
);

export class AssertFirstName extends AssertFirstNameBase {}
