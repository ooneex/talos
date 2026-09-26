import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSeedEnv, seedEnvFile } from "@/loadSeedEnv";

const previousDatabaseUrl = Bun.env.DATABASE_URL;

const databaseUrl = (): string | undefined => Bun.env.DATABASE_URL;

describe("seedEnvFile", () => {
  test("should point a seed script at the app env file", () => {
    expect(seedEnvFile("/repo/modules/tag/bin/seed/run.ts")).toBe("/repo/modules/app/.env.yml");
  });

  test("should ignore an entry point that is not a seed script", () => {
    expect(seedEnvFile("/repo/modules/app/src/index.ts")).toBeUndefined();
  });
});

describe("loadSeedEnv", () => {
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

  test("should leave the environment untouched for a non-seed entry point", async () => {
    delete Bun.env.DATABASE_URL;

    await loadSeedEnv("/repo/modules/app/src/index.ts");

    expect(databaseUrl()).toBeUndefined();
  });

  test("should load the app env file for a seed script", async () => {
    directory = await mkdtemp(join(tmpdir(), "seed-env-"));
    const main = join(directory, "modules/tag/bin/seed/run.ts");
    await Bun.write(join(directory, "modules/app/.env.yml"), "database:\n  url: postgres://from-yaml/talos\n");
    delete Bun.env.DATABASE_URL;

    await loadSeedEnv(main);

    expect(databaseUrl()).toBe("postgres://from-yaml/talos");
  });
});
