import { prompt } from "enquirer";
import { AssertRouteName } from "../constraints/AssertRouteName";

export const askRouteName = async (config: { message: string }) => {
  const response = await prompt<{ routeName: string }>({
    type: "input",
    name: "routeName",
    message: config.message,
    validate: (value) => {
      const constraint = new AssertRouteName();
      const result = constraint.validate(value);

      if (!result.isValid) {
        return result.message || "Route name is invalid";
      }

      return true;
    },
  });

  return response.routeName;
};
