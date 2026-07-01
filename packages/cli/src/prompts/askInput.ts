import { prompt } from "enquirer";

export const askInput = async (config: { message: string; initial?: string }) => {
  const response = await prompt<{ value: string }>({
    type: "input",
    name: "value",
    message: config.message,
    initial: config.initial,
    validate: (value) => (value.trim().length > 0 ? true : "A value is required"),
  });

  return response.value.trim();
};
