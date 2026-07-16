import { HTTP_METHODS } from "@talosjs/types";
import { AssertRouteMethod } from "../constraints/AssertRouteMethod";
import { prompt } from "./prompt";

export const askRouteMethod = async (config: { message: string; initial?: number }) => {
  const response = await prompt<{ method: string }>({
    type: "select",
    name: "method",
    message: config.message,
    initial: config.initial ?? 0,
    choices: HTTP_METHODS.map((method) => method),
    validate: (value) => {
      const constraint = new AssertRouteMethod();
      const result = constraint.validate(value);

      if (!result.isValid) {
        return result.message || "Route method is invalid";
      }

      return true;
    },
  });

  return response.method;
};
