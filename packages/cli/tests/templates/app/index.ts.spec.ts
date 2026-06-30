import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("index.ts.txt", () => {
  const templatePath = join(templatesDir, "app", "index.ts.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should import App from @talosjs/app", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@talosjs/app");
    expect(content).toContain("App");
  });

  test("should import RedisCache from @talosjs/cache", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { RedisCache } from "@talosjs/cache"');
  });

  test("should import TerminalLogger from @talosjs/logger", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { TerminalLogger } from "@talosjs/logger"');
    expect(content).toContain("@talosjs/logger");
  });

  test("should not import ResendMailer from @talosjs/mailer", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain('import { ResendMailer } from "@talosjs/mailer"');
  });

  test("should import CorsMiddleware from @talosjs/middleware", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { CorsMiddleware } from "@talosjs/middleware"');
  });

  test("should import RedisRateLimiter from @talosjs/rate-limit", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { RedisRateLimiter } from "@talosjs/rate-limit"');
  });

  test("should not import BunnyStorage from @talosjs/storage", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain('import { BunnyStorage } from "@talosjs/storage"');
  });

  test("should import AppModule", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { AppModule } from "./AppModule"');
  });

  test("should import OnAppStart", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { OnAppStart } from "./OnAppStart"');
  });

  test("should not import SharedDatabase", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain('import { SharedDatabase } from "@module/shared/databases/SharedDatabase"');
  });

  test("should import roles config", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import "@module/shared/roles.yml"');
  });

  test("should import env yml", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import "../../shared/.env.yml"');
  });

  test("should create new App instance", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("new App");
  });

  test("should configure app with required options", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("routing: {");
    expect(content).toContain('prefix: "api"');
    expect(content).toContain("loggers: [TerminalLogger]");
    expect(content).toContain("cache: RedisCache");
    expect(content).not.toContain("storage: BunnyStorage");
    expect(content).not.toContain("mailer: ResendMailer");
    expect(content).toContain("rateLimiter: RedisRateLimiter");
    expect(content).toContain("middlewares: AppModule.middlewares");
    expect(content).toContain("cors: CorsMiddleware");
    expect(content).not.toContain("permissions");
    expect(content).toContain("cronJobs: AppModule.cronJobs");
    expect(content).toContain("onStart: OnAppStart");
    expect(content).not.toContain("database: SharedDatabase");
    expect(content).not.toContain("generateRouteDoc");
  });

  test("should call app.run()", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("await app.run()");
  });

  test("should not contain directories configuration", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain("directories");
  });

  test("should not import join from node:path", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain('import { join } from "node:path"');
  });
});
