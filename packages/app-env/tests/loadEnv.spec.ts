import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { loadEnv } from "@/loadEnv";

const tmpBase = `${import.meta.dir}/tmp`;

describe("loadEnv", () => {
  let testDir: string;
  let cwdSpy: ReturnType<typeof spyOn<typeof process, "cwd">>;
  let existingKeys: Set<string>;

  beforeEach(() => {
    testDir = `${tmpBase}/${crypto.randomUUID()}`;
    mkdirSync(testDir, { recursive: true });
    cwdSpy = spyOn(process, "cwd").mockReturnValue(testDir);
    existingKeys = new Set(Object.keys(Bun.env));
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(Bun.env)) {
      if (!existingKeys.has(key)) {
        delete Bun.env[key];
      }
    }
  });

  test("does nothing when no .env.yml exists", async () => {
    await loadEnv();
    expect(Bun.env.APP_ENV).toBeUndefined();
  });

  test("loads .env.yml from project root", async () => {
    await Bun.write(`${testDir}/.env.yml`, 'app:\n  env: "local"\n');
    await loadEnv();
    expect(Bun.env.APP_ENV).toBe("local");
  });

  test("loads only the project root .env.yml, ignoring modules/app/.env.yml", async () => {
    mkdirSync(`${testDir}/modules/app`, { recursive: true });
    await Bun.write(`${testDir}/.env.yml`, 'app:\n  env: "production"\n');
    await Bun.write(`${testDir}/modules/app/.env.yml`, 'app:\n  env: "local"\n');
    await loadEnv();
    expect(Bun.env.APP_ENV).toBe("production");
  });

  test("does not fall back to modules/app/.env.yml when root .env.yml is absent", async () => {
    mkdirSync(`${testDir}/modules/app`, { recursive: true });
    await Bun.write(`${testDir}/modules/app/.env.yml`, 'app:\n  env: "local"\n');
    await loadEnv();
    expect(Bun.env.APP_ENV).toBeUndefined();
  });

  test("loads from custom candidate paths when provided", async () => {
    await Bun.write(`${testDir}/custom.env.yml`, 'app:\n  env: "staging"\n');
    await loadEnv([`${testDir}/custom.env.yml`]);
    expect(Bun.env.APP_ENV).toBe("staging");
  });

  test("skips missing candidates and loads the existing one", async () => {
    await Bun.write(`${testDir}/second.env.yml`, 'app:\n  env: "production"\n');
    await loadEnv([`${testDir}/missing.env.yml`, `${testDir}/second.env.yml`]);
    expect(Bun.env.APP_ENV).toBe("production");
  });

  test("layers candidates, later files overriding earlier keys", async () => {
    await Bun.write(`${testDir}/base.env.yml`, 'app:\n  env: "production"\n  port: 3000\n');
    await Bun.write(`${testDir}/override.env.yml`, "app:\n  port: 3001\n");
    await loadEnv([`${testDir}/base.env.yml`, `${testDir}/override.env.yml`]);
    // The later file overrides the port...
    expect(Bun.env.PORT).toBe("3001");
    // ...but inherits keys it does not set.
    expect(Bun.env.APP_ENV).toBe("production");
  });

  test("does not override earlier keys with empty later values", async () => {
    await Bun.write(`${testDir}/base.env.yml`, 'jwt:\n  secret: "root-secret"\n');
    await Bun.write(`${testDir}/override.env.yml`, 'jwt:\n  secret: ""\n');
    await loadEnv([`${testDir}/base.env.yml`, `${testDir}/override.env.yml`]);
    expect(Bun.env.JWT_SECRET).toBe("root-secret");
  });

  test("maps app.host to HOST_NAME not APP_HOST", async () => {
    await Bun.write(`${testDir}/.env.yml`, 'app:\n  host: "example.com"\n');
    await loadEnv();
    expect(Bun.env.HOST_NAME).toBe("example.com");
    expect(Bun.env.APP_HOST).toBeUndefined();
  });

  test("maps app.port to PORT not APP_PORT", async () => {
    await Bun.write(`${testDir}/.env.yml`, 'app:\n  port: "4000"\n');
    await loadEnv();
    expect(Bun.env.PORT).toBe("4000");
    expect(Bun.env.APP_PORT).toBeUndefined();
  });

  test("maps deeply nested path analytics.posthog.project_token", async () => {
    await Bun.write(`${testDir}/.env.yml`, 'analytics:\n  posthog:\n    project_token: "phc_abc123"\n');
    await loadEnv();
    expect(Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN).toBe("phc_abc123");
  });

  test("maps storage.filesystem.path to FILESYSTEM_STORAGE_PATH", async () => {
    await Bun.write(`${testDir}/.env.yml`, 'storage:\n  filesystem:\n    path: "/data/uploads"\n');
    await loadEnv();
    expect(Bun.env.FILESYSTEM_STORAGE_PATH).toBe("/data/uploads");
    expect(Bun.env.STORAGE_FILESYSTEM_PATH).toBeUndefined();
  });

  test("maps Turso database credentials", async () => {
    await Bun.write(
      `${testDir}/.env.yml`,
      'database:\n  turso:\n    url: "libsql://app.turso.io"\n    auth_token: "secret"\n',
    );
    await loadEnv();
    expect(Bun.env.TURSO_DATABASE_URL).toBe("libsql://app.turso.io");
    expect(Bun.env.TURSO_AUTH_TOKEN).toBe("secret");
  });

  test("maps Bunny database settings", async () => {
    await Bun.write(
      `${testDir}/.env.yml`,
      'database:\n  bunny:\n    url: "libsql://01jxyz-app.lite.bunnydb.net"\n    token: "bunny-token"\n',
    );
    await loadEnv();
    expect(Bun.env.DATABASE_BUNNY_URL).toBe("libsql://01jxyz-app.lite.bunnydb.net");
    expect(Bun.env.DATABASE_BUNNY_TOKEN).toBe("bunny-token");
  });

  test("maps Cloudflare D1 database settings", async () => {
    await Bun.write(
      `${testDir}/.env.yml`,
      [
        "database:",
        "  cloudflare:",
        '    account_id: "023e105f4ecef8ad9ca31a8372d0c353"',
        '    api_token: "cloudflare-token"',
        '    database_id: "f8d5b2a1-6c3e-4b7a-9d2f-0e1c3b5a7d9e"',
        '    database_name: "my-database"',
        '    jurisdiction: "eu"',
        '    primary_location_hint: "weur"',
        '    read_replication_mode: "auto"',
        "",
      ].join("\n"),
    );
    await loadEnv();
    expect(Bun.env.DATABASE_CLOUDFLARE_ACCOUNT_ID).toBe("023e105f4ecef8ad9ca31a8372d0c353");
    expect(Bun.env.DATABASE_CLOUDFLARE_API_TOKEN).toBe("cloudflare-token");
    expect(Bun.env.DATABASE_CLOUDFLARE_DATABASE_ID).toBe("f8d5b2a1-6c3e-4b7a-9d2f-0e1c3b5a7d9e");
    expect(Bun.env.DATABASE_CLOUDFLARE_DATABASE_NAME).toBe("my-database");
    expect(Bun.env.DATABASE_CLOUDFLARE_JURISDICTION).toBe("eu");
    expect(Bun.env.DATABASE_CLOUDFLARE_PRIMARY_LOCATION_HINT).toBe("weur");
    expect(Bun.env.DATABASE_CLOUDFLARE_READ_REPLICATION_MODE).toBe("auto");
  });

  test("maps stream.bunny keys to the STREAM_BUNNY_ names", async () => {
    await Bun.write(
      `${testDir}/.env.yml`,
      'stream:\n  bunny:\n    access_key: "sk_abc123"\n    library_id: "512345"\n',
    );
    await loadEnv();
    expect(Bun.env.STREAM_BUNNY_ACCESS_KEY).toBe("sk_abc123");
    expect(Bun.env.STREAM_BUNNY_LIBRARY_ID).toBe("512345");
  });

  test("maps mailer.resend.api_key to RESEND_API_KEY", async () => {
    await Bun.write(`${testDir}/.env.yml`, 'mailer:\n  resend:\n    api_key: "re_abc123"\n');
    await loadEnv();
    expect(Bun.env.RESEND_API_KEY).toBe("re_abc123");
  });

  test("maps search provider api keys", async () => {
    await Bun.write(
      `${testDir}/.env.yml`,
      [
        "search:",
        "  exa:",
        '    api_key: "exa_abc123"',
        "  firecrawl:",
        '    api_key: "fc_abc123"',
        "  pubmed:",
        '    api_key: "pubmed_abc123"',
        "  brightdata:",
        '    api_key: "brd_abc123"',
        '    serp_zone: "serp_zone1"',
        "",
      ].join("\n"),
    );
    await loadEnv();
    expect(Bun.env.SEARCH_EXA_API_KEY).toBe("exa_abc123");
    expect(Bun.env.SEARCH_FIRECRAWL_API_KEY).toBe("fc_abc123");
    expect(Bun.env.SEARCH_PUBMED_API_KEY).toBe("pubmed_abc123");
    expect(Bun.env.SEARCH_BRIGHTDATA_API_KEY).toBe("brd_abc123");
    expect(Bun.env.SEARCH_BRIGHTDATA_SERP_ZONE).toBe("serp_zone1");
  });

  test("falls back to uppercase path naming for unknown keys", async () => {
    await Bun.write(`${testDir}/.env.yml`, 'custom:\n  my_key: "value"\n');
    await loadEnv();
    expect(Bun.env.CUSTOM_MY_KEY).toBe("value");
  });

  test("skips empty string values", async () => {
    await Bun.write(`${testDir}/.env.yml`, 'app:\n  env: "local"\n  host: ""\n');
    await loadEnv();
    expect(Bun.env.APP_ENV).toBe("local");
    expect(Bun.env.HOST_NAME).toBeUndefined();
  });

  test("skips unset, null, and blank values", async () => {
    await Bun.write(
      `${testDir}/.env.yml`,
      ["app:", '  env: "local"', "  host:", '  port: "   "', "jwt:", "  secret: null", "cors:", "  origins: []", ""].join(
        "\n",
      ),
    );
    await loadEnv();
    expect(Bun.env.APP_ENV).toBe("local");
    expect(Bun.env.HOST_NAME).toBeUndefined();
    expect(Bun.env.PORT).toBeUndefined();
    expect(Bun.env.JWT_SECRET).toBeUndefined();
    expect(Bun.env.CORS_ORIGINS).toBeUndefined();
  });

  test("converts numeric values to strings", async () => {
    await Bun.write(`${testDir}/.env.yml`, "app:\n  port: 3000\n");
    await loadEnv();
    expect(Bun.env.PORT).toBe("3000");
  });

  test("converts boolean values to strings", async () => {
    await Bun.write(`${testDir}/.env.yml`, "cors:\n  credentials: true\n");
    await loadEnv();
    expect(Bun.env.CORS_CREDENTIALS).toBe("true");
  });

  test("sets multiple env vars from a single file", async () => {
    await Bun.write(
      `${testDir}/.env.yml`,
      ["app:", '  env: "production"', '  host: "0.0.0.0"', "  port: 8080", "jwt:", '  secret: "s3cr3t"'].join("\n"),
    );
    await loadEnv();
    expect(Bun.env.APP_ENV).toBe("production");
    expect(Bun.env.HOST_NAME).toBe("0.0.0.0");
    expect(Bun.env.PORT).toBe("8080");
    expect(Bun.env.JWT_SECRET).toBe("s3cr3t");
  });
});
