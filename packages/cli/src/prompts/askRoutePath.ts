import { prompt } from "enquirer";
import { AssertRoutePath } from "../constraints/AssertRoutePath";

export const askRoutePath = async (config: { message: string; initial?: string }) => {
  const response = await prompt<{ path: string }>({
    type: "input",
    name: "path",
    message: config.message,
    initial: config.initial ?? "/",
    validate: (value) => {
      const constraint = new AssertRoutePath();
      const result = constraint.validate(value);

      if (!result.isValid) {
        return result.message || "Route path is invalid";
      }

      return true;
    },
  });

  return response.path;
};
