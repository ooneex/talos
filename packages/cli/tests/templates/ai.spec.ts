import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("ai-chat.txt", () => {
  const templatePath = join(templatesDir, "ai-chat.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain the chat decorator and extend Chat", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.chat()");
    expect(content).toContain("extends Chat");
  });

  test("should declare the chat getters", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getModel");
    expect(content).toContain("getSystemPrompts");
    expect(content).toContain("getTools");
    expect(content).toContain("getMiddlewares");
  });
});

describe("ai-chat.test.txt", () => {
  const templatePath = join(templatesDir, "ai-chat.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/ai/chats/{{NAME}}Chat");
  });
});

describe("ai-tool.txt", () => {
  const templatePath = join(templatesDir, "ai-tool.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{SNAKE}}");
  });

  test("should contain the tool decorator and implement ITool", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.tool()");
    expect(content).toContain("implements ITool");
  });

  test("should declare the tool members", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getName");
    expect(content).toContain("getDescription");
    expect(content).toContain("getInputSchema");
    expect(content).toContain("handler");
  });
});

describe("ai-tool.test.txt", () => {
  const templatePath = join(templatesDir, "ai-tool.test.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should use @module import path", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@module/{{MODULE}}/ai/tools/{{NAME}}Tool");
  });
});

describe("ai-middleware.txt", () => {
  const templatePath = join(templatesDir, "ai-middleware.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{KEBAB}}");
  });

  test("should contain the middleware decorator and implement IMiddleware", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.middleware()");
    expect(content).toContain("implements IMiddleware");
  });

  test("should declare getName", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getName");
  });

  test("should declare basic lifecycle event hooks", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("onStart");
    expect(content).toContain("onFinish");
    expect(content).toContain("onError");
  });
});

describe("ai-middleware.test.txt", () => {
  const templatePath = join(templatesDir, "ai-middleware.test.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should use @module import path", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@module/{{MODULE}}/ai/middlewares/{{NAME}}Middleware");
  });
});
