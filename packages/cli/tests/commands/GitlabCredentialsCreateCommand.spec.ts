import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-gitlab-credentials-"));

const promptMock = mock((_config: { type?: string; name?: string; initial?: string }) =>
  Promise.resolve({ value: "prompted-token" }),
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

const { GitlabCredentialsCreateCommand } = await import("@/commands/GitlabCredentialsCreateCommand");

describe("GitlabCredentialsCreateCommand", () => {
  let command: InstanceType<typeof GitlabCredentialsCreateCommand>;
  const credentialsPath = join(testHome, ".talos", "credentials", "gitlab.yml");

  beforeEach(() => {
    command = new GitlabCredentialsCreateCommand();
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
      expect(command.getName()).toBe("gitlab:credentials:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Save a GitLab Personal Access Token under the user config");
    });
  });

  describe("run()", () => {
    test("should write the token to gitlab.yml under the default profile", async () => {
      await command.run({ token: "glpat-testtoken", silent: true });

      expect(existsSync(credentialsPath)).toBe(true);

      const content = await Bun.file(credentialsPath).text();
      expect(content).toMatch(/^profiles:\n {2}default:\n {4}token: glpat-testtoken\n$/);
    });

    test("should not prompt when the token is provided", async () => {
      await command.run({ token: "glpat-testtoken", silent: true });

      expect(promptMock).not.toHaveBeenCalled();
    });

    test("should prompt for the token when it is not provided", async () => {
      await command.run({ silent: true });

      expect(promptMock).toHaveBeenCalledTimes(1);

      const content = await Bun.file(credentialsPath).text();
      expect(content).toContain("token: prompted-token");
    });

    test("should prompt with a masked password input", async () => {
      await command.run({ silent: true });

      const config = promptMock.mock.calls[0]?.[0] as { type?: string };
      expect(config?.type).toBe("password");
    });

    test("should print the token creation URL when not silent", async () => {
      await command.run({ token: "glpat-testtoken" });

      expect(infoCalls.some((message) => message.includes("personal_access_tokens"))).toBe(true);
    });

    test("should log a success message when not silent", async () => {
      await command.run({ token: "glpat-testtoken" });

      expect(successCalls).toHaveLength(1);
      expect(successCalls[0]).toContain(credentialsPath);
    });

    test("should not log any output when silent is true", async () => {
      await command.run({ token: "glpat-testtoken", silent: true });

      expect(successCalls).toHaveLength(0);
      expect(infoCalls).toHaveLength(0);
    });
  });
});
