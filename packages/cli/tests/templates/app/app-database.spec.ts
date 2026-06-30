import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("app-database.txt", () => {
  const file = Bun.file(join(templatesDir, "app", "app-database.txt"));

  test("should exist", async () => {
    expect(await file.exists()).toBe(true);
  });

  test("should contain SharedDatabase class", async () => {
    const content = await file.text();
    expect(content).toContain("class SharedDatabase");
  });

  test("should contain database decorator", async () => {
    const content = await file.text();
    expect(content).toContain("@decorator.database()");
  });

  test("should extend TypeormDatabase", async () => {
    const content = await file.text();
    expect(content).toContain("extends TypeormDatabase");
  });

  test("should import from @talosjs/database", async () => {
    const content = await file.text();
    expect(content).toContain("TypeormDatabase");
    expect(content).toContain("DatabaseException");
    expect(content).toContain("decorator");
    expect(content).toContain("@talosjs/database");
  });

  test("should import AppEnv from @talosjs/app-env", async () => {
    const content = await file.text();
    expect(content).toContain("@talosjs/app-env");
    expect(content).toContain("AppEnv");
  });

  test("should import inject from @talosjs/container", async () => {
    const content = await file.text();
    expect(content).toContain("inject");
    expect(content).toContain("@talosjs/container");
  });

  test("should have getSource method returning DataSource", async () => {
    const content = await file.text();
    expect(content).toContain("getSource");
    expect(content).toContain("DataSource");
  });

  test("should use postgres type", async () => {
    const content = await file.text();
    expect(content).toContain('type: "postgres"');
  });

  test("should use DATABASE_URL from env", async () => {
    const content = await file.text();
    expect(content).toContain("this.env.DATABASE_URL");
  });

  test("should throw DatabaseException when URL is missing", async () => {
    const content = await file.text();
    expect(content).toContain("throw new DatabaseException");
    expect(content).toContain("DATABASE_URL");
    expect(content).toContain('"CONNECTION_FAILED"');
  });

  test("should import SharedModule", async () => {
    const content = await file.text();
    expect(content).toContain('import { SharedModule } from "@module/shared/SharedModule"');
    expect(content).toContain("SharedModule.entities");
  });

  test("should configure connection pool", async () => {
    const content = await file.text();
    expect(content).toContain("poolSize: 10");
    expect(content).toContain("max: 10");
    expect(content).toContain("min: 2");
    expect(content).toContain("idleTimeoutMillis: 30_000");
    expect(content).toContain("connectionTimeoutMillis: 5_000");
    expect(content).toContain("allowExitOnIdle: false");
    expect(content).toContain("maxLifetimeSeconds: 1_800");
  });

  test("should disable synchronize", async () => {
    const content = await file.text();
    expect(content).toContain("synchronize: false");
  });

  test("should cache DataSource instance", async () => {
    const content = await file.text();
    expect(content).toContain("if (this.source)");
  });

  test("should configure logging", async () => {
    const content = await file.text();
    expect(content).toContain('logging: ["error", "warn", "migration"]');
  });

  test("should configure max query execution time", async () => {
    const content = await file.text();
    expect(content).toContain("maxQueryExecutionTime: 1_000");
  });
});
