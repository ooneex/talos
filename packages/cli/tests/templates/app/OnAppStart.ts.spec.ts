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

  test("should not declare a constructor", async () => {
    const content = await file.text();
    expect(content).not.toContain("constructor");
    expect(content).not.toContain("inject");
    expect(content).not.toContain("TerminalLogger");
  });

  test("should import Server type from bun", async () => {
    const content = await file.text();
    expect(content).toContain('import type { Server } from "bun"');
  });

  test("should implement a handle method receiving the server", async () => {
    const content = await file.text();
    expect(content).toContain("public handle(_server: Server<unknown>): void | Promise<void>");
  });
});
