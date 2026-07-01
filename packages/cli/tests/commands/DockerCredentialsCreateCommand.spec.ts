import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-docker-credentials-"));

const promptMock = mock((config: { type?: string; message?: string; initial?: string }) => {
  if (config?.type === "password") {
    return Promise.resolve({ value: "prompted-token" });
  }
  // Input prompts (registry, username) fall back to their initial when provided.
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

const { DockerCredentialsCreateCommand } = await import("@/commands/DockerCredentialsCreateCommand");

describe("DockerCredentialsCreateCommand", () => {
  let command: InstanceType<typeof DockerCredentialsCreateCommand>;
  const credentialsPath = join(testHome, ".talos", "credentials", "docker.yml");

  beforeEach(() => {
    command = new DockerCredentialsCreateCommand();
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
      expect(command.getName()).toBe("docker:credentials:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Save a Docker registry access token under the user config");
    });
  });

  describe("run()", () => {
    test("should write registry, username and token to docker.yml under the user config", async () => {
      await command.run({ registry: "ghcr.io", username: "octocat", token: "dckr_testtoken123", silent: true });

      expect(existsSync(credentialsPath)).toBe(true);

      const content = await Bun.file(credentialsPath).text();
      expect(content).toContain("profiles:");
      expect(content).toContain("default:");
      expect(content).toContain("registry: ghcr.io");
      expect(content).toContain("username: octocat");
      expect(content).toContain("token: dckr_testtoken123");
    });

    test("should write the fields under the default profile in block-style YAML", async () => {
      await command.run({ registry: "ghcr.io", username: "octocat", token: "dckr_testtoken123", silent: true });

      const content = await Bun.file(credentialsPath).text();
      expect(content).toMatch(
        /^profiles:\n {2}default:\n {4}registry: ghcr\.io\n {4}username: octocat\n {4}token: dckr_testtoken123\n$/,
      );
    });

    test("should not prompt when all fields are provided", async () => {
      await command.run({ registry: "ghcr.io", username: "octocat", token: "dckr_testtoken123", silent: true });

      expect(promptMock).not.toHaveBeenCalled();
    });

    test("should prompt for missing fields", async () => {
      await command.run({ silent: true });

      expect(promptMock).toHaveBeenCalledTimes(3);

      const content = await Bun.file(credentialsPath).text();
      expect(content).toContain("token: prompted-token");
    });

    test("should default the registry to docker.io when prompting", async () => {
      await command.run({ username: "octocat", token: "dckr_testtoken123", silent: true });

      const registryCall = promptMock.mock.calls.find(
        (call) => (call[0] as { message?: string })?.message === "Enter Docker registry",
      );
      expect((registryCall?.[0] as { initial?: string })?.initial).toBe("docker.io");

      const content = await Bun.file(credentialsPath).text();
      expect(content).toContain("registry: docker.io");
    });

    test("should prompt for the token with a masked password input", async () => {
      await command.run({ registry: "ghcr.io", username: "octocat", silent: true });

      const tokenCall = promptMock.mock.calls.find((call) => (call[0] as { type?: string })?.type === "password");
      expect(tokenCall).toBeDefined();
    });

    test("should print the token creation URL when not silent", async () => {
      await command.run({ registry: "ghcr.io", username: "octocat", token: "dckr_testtoken123" });

      expect(infoCalls.some((message) => message.includes("personal-access-tokens"))).toBe(true);
    });

    test("should log a success message when not silent", async () => {
      await command.run({ registry: "ghcr.io", username: "octocat", token: "dckr_testtoken123" });

      expect(successCalls).toHaveLength(1);
      expect(successCalls[0]).toContain(credentialsPath);
    });

    test("should not log a success message when silent is true", async () => {
      await command.run({ registry: "ghcr.io", username: "octocat", token: "dckr_testtoken123", silent: true });

      expect(successCalls).toHaveLength(0);
      expect(infoCalls).toHaveLength(0);
    });
  });
});
