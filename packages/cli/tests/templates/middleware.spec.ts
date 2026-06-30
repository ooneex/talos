import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("middleware.txt", () => {
  const templatePath = join(templatesDir, "middleware.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain middleware decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.middleware()");
  });

  test("should implement IMiddleware interface", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("implements IMiddleware");
  });

  test("should have handler method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("handler");
  });
});

describe("middleware.test.txt", () => {
  const templatePath = join(templatesDir, "middleware.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/middlewares/{{NAME}}Middleware");
  });

  test("should test handler method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("handler");
  });
});

describe("middleware.socket.txt", () => {
  const templatePath = join(templatesDir, "middleware.socket.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should import from @talosjs/socket", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@talosjs/socket");
  });

  test("should contain middleware decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.middleware()");
  });

  test("should implement IMiddleware interface", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("implements IMiddleware");
  });

  test("should have handler method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("handler");
  });
});
