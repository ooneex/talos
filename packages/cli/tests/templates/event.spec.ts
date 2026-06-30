import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("event.txt", () => {
  const templatePath = join(templatesDir, "event.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{CHANNEL}}");
  });

  test("should contain pubSub decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.event()");
  });

  test("should extend RedisPubSub", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("extends RedisPubSub");
  });

  test("should have pubsub methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getChannel");
    expect(content).toContain("handler");
  });
});

describe("event.test.txt", () => {
  const templatePath = join(templatesDir, "event.test.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{MODULE}}");
  });

  test("should use @module import path", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@module/{{MODULE}}/events/{{NAME}}Event");
  });

  test("should test pubsub methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getChannel");
    expect(content).toContain("handler");
    expect(content).toContain("publish");
    expect(content).toContain("subscribe");
  });
});
