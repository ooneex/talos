import { prompt } from "enquirer";

export const askConfirm = async (config: { message: string; initial?: boolean }) => {
  const response = await prompt<{ confirm: boolean }>({
    type: "confirm",
    name: "confirm",
    message: config.message,
    initial: config.initial,
  });

  return response.confirm;
};
