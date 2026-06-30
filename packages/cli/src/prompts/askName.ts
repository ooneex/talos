import { prompt } from "enquirer";
import { AssertName } from "../constraints/AssertName";

export const askName = async (config: { message: string }) => {
  const response = await prompt<{ name: string }>({
    type: "input",
    name: "name",
    message: config.message,
    validate: (value) => {
      const constraint = new AssertName();
      const result = constraint.validate(value);

      if (!result.isValid) {
        return result.message || "Controller name is invalid";
      }

      return true;
    },
  });

  return response.name;
};
