import { prompt } from "enquirer";

export const askPassword = async (config: { message: string }) => {
  const response = await prompt<{ value: string }>({
    type: "password",
    name: "value",
    message: config.message,
    validate: (value) => (value.trim().length > 0 ? true : "A value is required"),
  });

  return response.value.trim();
};
