import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("Dockerfile.txt", () => {
  const templatePath = join(templatesDir, "app", "Dockerfile.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should pin the Bun version and use it as the base image", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("ARG BUN_VERSION=");
    expect(content).toContain("FROM oven/bun:${BUN_VERSION} AS base");
    expect(content).toContain("WORKDIR /app");
    expect(content).toContain("ENV HUSKY=0");
  });

  test("should contain dependency stages", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("FROM base AS deps");
    expect(content).toContain("FROM base AS prod-deps");
    expect(content).toContain("COPY package.json bun.lock ./");
    expect(content).toContain("bun install --frozen-lockfile");
    expect(content).toContain("bun install --frozen-lockfile --production");
  });

  test("should not contain a local hot-reload stage", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain("FROM base AS local");
    expect(content).not.toContain("ENV NODE_ENV=local");
    expect(content).not.toContain('CMD ["bun", "--hot", "run", "modules/app/src/index.ts"]');
  });

  test("should contain build stage", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("FROM base AS build");
    expect(content).toContain("ENV NODE_ENV=production");
    expect(content).toContain("RUN bun run build");
  });

  test("should contain production stage", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("FROM base AS production");
    expect(content).toContain("COPY --from=prod-deps /app/node_modules ./node_modules");
    expect(content).toContain("COPY --from=build /app/dist ./dist");
    expect(content).toContain("HEALTHCHECK");
    expect(content).toContain('CMD ["bun", "run", "dist/index.js"]');
  });

  test("should drop privileges and expose the port", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("USER bun");
    expect(content).toContain("EXPOSE 3500");
  });

  test("should document the production build command", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("--target production");
    expect(content).toContain("docker build -f modules/app/Dockerfile");
    expect(content).not.toContain("target: local");
  });
});
