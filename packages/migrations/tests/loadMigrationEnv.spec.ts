import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMigrationEnv, migrationEnvFile } from "@/loadMigrationEnv";

const previousDatabaseUrl = Bun.env.DATABASE_URL;

const databaseUrl = (): string | undefined => Bun.env.DATABASE_URL;

describe("migrationEnvFile", () => {
  test("should point a migration up script at the app env file", () => {
    expect(migrationEnvFile("/repo/modules/agenda/bin/migration/up.ts")).toBe("/repo/modules/app/.env.yml");
  });

  test("should point a migration down script at the app env file", () => {
    expect(migrationEnvFile("/repo/modules/library/bin/migration/down.ts")).toBe("/repo/modules/app/.env.yml");
  });

  test("should ignore an entry point that is not a migration script", () => {
    expect(migrationEnvFile("/repo/modules/app/src/index.ts")).toBeUndefined();
  });
});

describe("loadMigrationEnv", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (previousDatabaseUrl === undefined) {
      delete Bun.env.DATABASE_URL;
    } else {
      Bun.env.DATABASE_URL = previousDatabaseUrl;
    }

    if (directory) {
      await rm(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  test("should leave the environment untouched for a non-migration entry point", async () => {
    delete Bun.env.DATABASE_URL;

    await loadMigrationEnv("/repo/modules/app/src/index.ts");

    expect(databaseUrl()).toBeUndefined();
  });

  test("should load the app env file for a migration script", async () => {
    directory = await mkdtemp(join(tmpdir(), "migration-env-"));
    const main = join(directory, "modules/agenda/bin/migration/up.ts");
    await Bun.write(join(directory, "modules/app/.env.yml"), "database:\n  url: postgres://from-yaml/talos\n");
    delete Bun.env.DATABASE_URL;

    await loadMigrationEnv(main);

    expect(databaseUrl()).toBe("postgres://from-yaml/talos");
  });
});
