import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-jira-credentials-"));

const promptMock = mock((_config: { type?: string; name?: string; initial?: string }) =>
  Promise.resolve({ value: "prompted-value" }),
);

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

const { JiraCredentialsCreateCommand } = await import("@/commands/JiraCredentialsCreateCommand");

describe("JiraCredentialsCreateCommand", () => {
  let command: InstanceType<typeof JiraCredentialsCreateCommand>;
  const credentialsPath = join(testHome, ".talos", "credentials", "jira.yml");

  beforeEach(() => {
    command = new JiraCredentialsCreateCommand();
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
      expect(command.getName()).toBe("jira:credentials:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Save a Jira API token under the user config");
    });
  });

  describe("run()", () => {
    test("should write the credentials to jira.yml under the user config", async () => {
      await command.run({
        baseUrl: "https://acme.atlassian.net",
        email: "dev@acme.com",
        token: "jira_api_testtoken123",
        silent: true,
      });

      expect(existsSync(credentialsPath)).toBe(true);

      const content = await Bun.file(credentialsPath).text();
      expect(content).toContain("profiles:");
      expect(content).toContain("default:");
      expect(content).toContain("baseUrl: https://acme.atlassian.net");
      expect(content).toContain("email: dev@acme.com");
      expect(content).toContain("token: jira_api_testtoken123");
    });

    test("should write the values under the default profile in block-style YAML", async () => {
      await command.run({
        baseUrl: "https://acme.atlassian.net",
        email: "dev@acme.com",
        token: "jira_api_testtoken123",
        silent: true,
      });

      const content = await Bun.file(credentialsPath).text();
      expect(content).toMatch(
        /^profiles:\n {2}default:\n {4}baseUrl: https:\/\/acme\.atlassian\.net\n {4}email: dev@acme\.com\n {4}token: jira_api_testtoken123\n$/,
      );
    });

    test("should not prompt when all values are provided", async () => {
      await command.run({
        baseUrl: "https://acme.atlassian.net",
        email: "dev@acme.com",
        token: "jira_api_testtoken123",
        silent: true,
      });

      expect(promptMock).not.toHaveBeenCalled();
    });

    test("should prompt for base URL, email and token when they are not provided", async () => {
      await command.run({ silent: true });

      expect(promptMock).toHaveBeenCalledTimes(3);

      const content = await Bun.file(credentialsPath).text();
      expect(content).toContain("baseUrl: prompted-value");
      expect(content).toContain("email: prompted-value");
      expect(content).toContain("token: prompted-value");
    });

    test("should prompt for the token with a masked password input", async () => {
      await command.run({ silent: true });

      const tokenConfig = promptMock.mock.calls.at(-1)?.[0] as { type?: string };
      expect(tokenConfig?.type).toBe("password");
    });

    test("should print the token creation URL when not silent", async () => {
      await command.run({
        baseUrl: "https://acme.atlassian.net",
        email: "dev@acme.com",
        token: "jira_api_testtoken123",
      });

      expect(infoCalls.some((message) => message.includes("id.atlassian.com/manage-profile/security/api-tokens"))).toBe(
        true,
      );
    });

    test("should log a success message when not silent", async () => {
      await command.run({
        baseUrl: "https://acme.atlassian.net",
        email: "dev@acme.com",
        token: "jira_api_testtoken123",
      });

      expect(successCalls).toHaveLength(1);
      expect(successCalls[0]).toContain(credentialsPath);
    });

    test("should not log a success message when silent is true", async () => {
      await command.run({
        baseUrl: "https://acme.atlassian.net",
        email: "dev@acme.com",
        token: "jira_api_testtoken123",
        silent: true,
      });

      expect(successCalls).toHaveLength(0);
      expect(infoCalls).toHaveLength(0);
    });
  });
});
