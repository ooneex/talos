import { prompt } from "enquirer";

type CiProviderType = "github" | "gitlab" | "bitbucket";

export const askCiProvider = async (config: { message: string }) => {
  const response = await prompt<{ provider: CiProviderType }>({
    type: "select",
    name: "provider",
    message: config.message,
    choices: ["github", "gitlab", "bitbucket"],
  });

  return response.provider;
};
