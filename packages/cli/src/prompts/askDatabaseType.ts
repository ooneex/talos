import { prompt } from "enquirer";

export type DatabaseTypeType = "postgres" | "sqlite" | "redis";

export const askDatabaseType = async (config: { message: string }) => {
  const response = await prompt<{ type: DatabaseTypeType }>({
    type: "select",
    name: "type",
    message: config.message,
    choices: ["postgres", "sqlite", "redis"],
  });

  return response.type;
};
