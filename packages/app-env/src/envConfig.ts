import envContent from "./env.yml" with { type: "text" };

const envConfig = Bun.YAML.parse(envContent) as Record<string, unknown>;

export { envConfig, envContent };
