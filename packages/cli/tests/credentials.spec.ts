import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-credentials-"));

// Stub enquirer so re-mocking node:os does not trip its ESM-interop import
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({})),
}));

// Mock logger so saveCredentials does not emit output during tests
mock.module("@talosjs/logger", () => ({
  TerminalLogger: class {
    init() {}
    info() {}
    error() {}
    warn() {}
    debug() {}
    log() {}
    success() {}
  },
  decorator: {
    logger: () => () => {},
  },
}));

// Mock homedir so credentials are read from and written to an isolated temp dir
mock.module("node:os", () => ({
  ...nodeOs,
  homedir: () => testHome,
}));

const { readCredentials, saveCredentials } = await import("@/credentials");

describe("credentials", () => {
  const credentialsDir = join(testHome, ".talos", "credentials");

  beforeEach(() => {
    if (existsSync(credentialsDir)) {
      rmSync(credentialsDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  describe("readCredentials()", () => {
    test("should return null when the file does not exist", async () => {
      expect(await readCredentials("linear.yml")).toBeNull();
    });

    test("should read the default profile saved by saveCredentials", async () => {
      await saveCredentials("linear.yml", "Linear", { token: "lin_api_123" }, true);

      expect(await readCredentials("linear.yml")).toEqual({ token: "lin_api_123" });
    });

    test("should read a multi-field profile (Jira)", async () => {
      const profile = { baseUrl: "https://acme.atlassian.net", email: "user@acme.com", token: "jira-token" };
      await saveCredentials("jira.yml", "Jira", profile, true);

      expect(await readCredentials("jira.yml")).toEqual(profile);
    });

    test("should return null when the profiles.default key is absent", async () => {
      await Bun.write(join(credentialsDir, "linear.yml"), "profiles: {}\n");

      expect(await readCredentials("linear.yml")).toBeNull();
    });
  });
});
