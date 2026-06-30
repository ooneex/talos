import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("OnAppStart.ts.txt", () => {
  const file = Bun.file(join(templatesDir, "app", "OnAppStart.ts.txt"));

  test("should exist", async () => {
    expect(await file.exists()).toBe(true);
  });

  test("should contain OnAppStart class implementing IAppEventStart", async () => {
    const content = await file.text();
    expect(content).toContain("class OnAppStart implements IAppEventStart");
  });

  test("should use the app event start decorator", async () => {
    const content = await file.text();
    expect(content).toContain("@decorator.app.event.start()");
  });

  test("should import decorator and IAppEventStart from @talosjs/app", async () => {
    const content = await file.text();
    expect(content).toContain('import { decorator, type IAppEventStart } from "@talosjs/app"');
  });

  test("should inject TerminalLogger via the constructor", async () => {
    const content = await file.text();
    expect(content).toContain("inject");
    expect(content).toContain('import { inject } from "@talosjs/container"');
    expect(content).toContain('import { TerminalLogger } from "@talosjs/logger"');
    expect(content).toContain("@inject(TerminalLogger) private readonly logger: TerminalLogger");
  });

  test("should import Server type from bun", async () => {
    const content = await file.text();
    expect(content).toContain('import type { Server } from "bun"');
  });

  test("should implement a handle method receiving the server", async () => {
    const content = await file.text();
    expect(content).toContain("public handle(server: Server<unknown>): void | Promise<void>");
  });

  test("should normalize the hostname and build the base url", async () => {
    const content = await file.text();
    expect(content).toContain('let hostname = server.hostname || "0.0.0.0"');
    expect(content).toContain('if (hostname === "0.0.0.0")');
    expect(content).toContain('hostname = "localhost"');
    expect(content).toContain("const baseUrl = `${server.protocol}://${hostname}:${server.port}`");
  });

  test("should log the running server url via the injected logger", async () => {
    const content = await file.text();
    expect(content).toContain("this.logger.info(`Server running at ${baseUrl}`)");
  });
});
