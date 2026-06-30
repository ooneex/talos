import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("docker-compose.yml.txt", () => {
  const templatePath = join(templatesDir, "app", "docker-compose.yml.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}_db");
    expect(content).toContain("{{NAME}}_redis");
    expect(content).toContain("{{NAME}}_db_data");
    expect(content).toContain("{{NAME}}_redis_data");
  });

  test("should contain services definition", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("services:");
  });

  test("should contain postgres service", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("postgres:");
    expect(content).toContain("image: postgres:18.3-alpine3.23");
    expect(content).toContain("container_name: {{NAME}}_db");
    expect(content).toContain("POSTGRES_DATABASE=talos");
    expect(content).toContain("POSTGRES_USER=talos");
    expect(content).toContain("POSTGRES_PASSWORD=talos");
    expect(content).toContain('"5432:5432"');
  });

  test("should contain redis service", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("redis:");
    expect(content).toContain("image: redis:8.4-alpine");
    expect(content).toContain("container_name: {{NAME}}_redis");
    expect(content).toContain('"6379:6379"');
  });

  test("should contain restart policy", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('restart: "on-failure"');
  });

  test("should contain volumes definition", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("volumes:");
    expect(content).toContain("{{NAME}}_db_data:/var/lib/postgresql/data:rw");
    expect(content).toContain("{{NAME}}_redis_data:/data:rw");
  });
});
