import { AssertDestination } from "../constraints/AssertDestination";
import { prompt } from "./prompt";

export const askDestination = async (config: { message: string; initial?: string }) => {
  const assertDestination = new AssertDestination();

  const response = await prompt<{ destination: string }>({
    type: "input",
    name: "destination",
    message: config.message,
    initial: config.initial || ".",
    validate: (value) => {
      const result = assertDestination.validate(value);
      if (!result.isValid) {
        return result.message || "Invalid destination";
      }

      return true;
    },
  });

  return response.destination;
};
