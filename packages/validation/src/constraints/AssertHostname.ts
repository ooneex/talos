import { Assert, createConstraint } from "../utils";

const AssertHostnameBase: ReturnType<typeof createConstraint> = createConstraint(
  () =>
    Assert(
      /^$|^((25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$|^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})*$/,
    ),
  "Must be a valid hostname or IP address",
);

export class AssertHostname extends AssertHostnameBase {}
