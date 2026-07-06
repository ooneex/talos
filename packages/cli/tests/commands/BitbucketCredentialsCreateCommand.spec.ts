import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-bitbucket-credentials-"));

const promptMock = mock((config: { type?: string; message?: string; initial?: string }) => {
  if (config?.type === "password") {
    return Promise.resolve({ value: "prompted-token" });
  }
  // Input prompts (username) fall back to their initial when provided.
  return Promise.resolve({ value: config?.initial ?? "prompted-input" });
});

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: promptMock,
}));

let infoCalls: string[] = [];
let successCalls: string[] = [];

// Mock logger to capture output
mock.module("@talosjs/logger", () => ({
  TerminalLogger: class {
    init() {}
    info(message: string) {
      infoCalls.push(message);
    }
    error() {}
    warn() {}
    debug() {}
    log() {}
    success(message: string) {
      successCalls.push(message);
    }
  },
  decorator: {
    logger: () => () => {},
  },
}));

// Mock homedir so credentials are written to an isolated temp dir
mock.module("node:os", () => ({
  ...nodeOs,
  homedir: () => testHome,
}));

const { BitbucketCredentialsCreateCommand } = await import("@/commands/BitbucketCredentialsCreateCommand");

describe("BitbucketCredentialsCreateCommand", () => {
  let command: InstanceType<typeof BitbucketCredentialsCreateCommand>;
  const credentialsPath = join(testHome, ".talos", "credentials", "bitbucket.yml");

  beforeEach(() => {
    command = new BitbucketCredentialsCreateCommand();
    promptMock.mockClear();
    infoCalls = [];
    successCalls = [];
    if (existsSync(credentialsPath)) {
      rmSync(credentialsPath);
    }
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("bitbucket:credentials:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Save a Bitbucket app password under the user config");
    });
  });

  describe("run()", () => {
    test("should write the username and token to bitbucket.yml under the default profile", async () => {
      await command.run({ username: "acme", token: "ATBB-secret", silent: true });

      expect(existsSync(credentialsPath)).toBe(true);

      const content = await Bun.file(credentialsPath).text();
      expect(content).toContain("profiles:");
      expect(content).toContain("default:");
      expect(content).toContain("username: acme");
      expect(content).toContain("token: ATBB-secret");
    });

    test("should not prompt when username and token are provided", async () => {
      await command.run({ username: "acme", token: "ATBB-secret", silent: true });

      expect(promptMock).not.toHaveBeenCalled();
    });

    test("should prompt for the username and token when they are not provided", async () => {
      await command.run({ silent: true });

      expect(promptMock).toHaveBeenCalledTimes(2);

      const content = await Bun.file(credentialsPath).text();
      expect(content).toContain("token: prompted-token");
    });

    test("should mask the app password prompt", async () => {
      await command.run({ username: "acme", silent: true });

      const config = promptMock.mock.calls[0]?.[0] as { type?: string };
      expect(config?.type).toBe("password");
    });

    test("should print the app password creation URL when not silent", async () => {
      await command.run({ username: "acme", token: "ATBB-secret" });

      expect(infoCalls.some((message) => message.includes("app-passwords"))).toBe(true);
    });

    test("should log a success message when not silent", async () => {
      await command.run({ username: "acme", token: "ATBB-secret" });

      expect(successCalls).toHaveLength(1);
      expect(successCalls[0]).toContain(credentialsPath);
    });

    test("should not log any output when silent is true", async () => {
      await command.run({ username: "acme", token: "ATBB-secret", silent: true });

      expect(successCalls).toHaveLength(0);
      expect(infoCalls).toHaveLength(0);
    });
  });
});
