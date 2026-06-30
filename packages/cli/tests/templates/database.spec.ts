import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("database.pg.txt", () => {
  const file = Bun.file(join(templatesDir, "database.pg.txt"));

  test("should exist", async () => {
    expect(await file.exists()).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await file.text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain database decorator", async () => {
    const content = await file.text();
    expect(content).toContain("@decorator.database()");
  });

  test("should extend TypeormDatabase", async () => {
    const content = await file.text();
    expect(content).toContain("extends TypeormDatabase");
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

  test("should cache DataSource instance", async () => {
    const content = await file.text();
    expect(content).toContain("if (this.source)");
  });
});

describe("database.sqlite.txt", () => {
  const file = Bun.file(join(templatesDir, "database.sqlite.txt"));

  test("should exist", async () => {
    expect(await file.exists()).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await file.text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain database decorator", async () => {
    const content = await file.text();
    expect(content).toContain("@decorator.database()");
  });

  test("should extend TypeormDatabase", async () => {
    const content = await file.text();
    expect(content).toContain("extends TypeormDatabase");
  });

  test("should have getSource method returning DataSource", async () => {
    const content = await file.text();
    expect(content).toContain("getSource");
    expect(content).toContain("DataSource");
  });

  test("should use better-sqlite3 type", async () => {
    const content = await file.text();
    expect(content).toContain('type: "better-sqlite3"');
  });

  test("should use SQLITE_DATABASE_PATH from env", async () => {
    const content = await file.text();
    expect(content).toContain("this.env.SQLITE_DATABASE_PATH");
  });

  test("should throw DatabaseException when path is missing", async () => {
    const content = await file.text();
    expect(content).toContain("throw new DatabaseException");
    expect(content).toContain("SQLITE_DATABASE_PATH");
    expect(content).toContain('"CONNECTION_FAILED"');
  });

  test("should import SharedModule", async () => {
    const content = await file.text();
    expect(content).toContain('import { SharedModule } from "@module/shared/SharedModule"');
    expect(content).toContain("SharedModule.entities");
  });

  test("should cache DataSource instance", async () => {
    const content = await file.text();
    expect(content).toContain("if (!this.source)");
  });
});

describe("database.redis.txt", () => {
  const file = Bun.file(join(templatesDir, "database.redis.txt"));

  test("should exist", async () => {
    expect(await file.exists()).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await file.text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain database decorator", async () => {
    const content = await file.text();
    expect(content).toContain("@decorator.database()");
  });

  test("should extend RedisDatabase", async () => {
    const content = await file.text();
    expect(content).toContain("extends RedisDatabase");
  });

  test("should import RedisDatabase from @talosjs/database", async () => {
    const content = await file.text();
    expect(content).toContain('import { RedisDatabase, decorator } from "@talosjs/database"');
  });

  test("should inject AppEnv", async () => {
    const content = await file.text();
    expect(content).toContain("@inject(AppEnv)");
  });
});

describe("database.redis.test.txt", () => {
  const file = Bun.file(join(templatesDir, "database.redis.test.txt"));

  test("should exist", async () => {
    expect(await file.exists()).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await file.text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{MODULE}}");
  });

  test("should use @module import path", async () => {
    const content = await file.text();
    expect(content).toContain("@module/{{MODULE}}/databases/{{NAME}}Database");
  });

  test("should test getClient method", async () => {
    const content = await file.text();
    expect(content).toContain("getClient");
  });
});

describe("database.test.txt", () => {
  const file = Bun.file(join(templatesDir, "database.test.txt"));

  test("should exist", async () => {
    expect(await file.exists()).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await file.text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{MODULE}}");
  });

  test("should use @module import path", async () => {
    const content = await file.text();
    expect(content).toContain("@module/{{MODULE}}/databases/{{NAME}}Database");
  });

  test("should test getSource method", async () => {
    const content = await file.text();
    expect(content).toContain("getSource");
  });
});
