import { prompt } from "enquirer";

const DOCKER_SERVICES = [
  "clickhouse",
  "elasticsearch",
  "grafana",
  "jaeger",
  "keycloak",
  "libretranslate",
  "maildev",
  "memcached",
  "minio",
  "mongodb",
  "mysql",
  "nats",
  "postgres",
  "prometheus",
  "rabbitmq",
  "redis",
  "temporal",
  "vault",
] as const;

export type DockerServiceType = (typeof DOCKER_SERVICES)[number];

export const askDockerService = async (config: { message: string; initial?: string }) => {
  const response = await prompt<{ service: DockerServiceType }>({
    type: "autocomplete",
    name: "service",
    message: config.message,
    initial: config.initial,
    choices: DOCKER_SERVICES.map((service) => service),
    validate: (value) => {
      if (!DOCKER_SERVICES.includes(value as DockerServiceType)) {
        return "Docker service is invalid";
      }

      return true;
    },
  });

  return response.service;
};
