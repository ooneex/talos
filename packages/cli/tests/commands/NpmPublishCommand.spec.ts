import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-npm-publish-home-"));

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ value: "" })),
}));

let errorCalls: string[] = [];
let successCalls: string[] = [];

// Mock logger to capture output
mock.module("@talosjs/logger", () => ({
  TerminalLogger: class {
    init() {}
    info() {}
    error(message: string) {
      errorCalls.push(message);
    }
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

// Mock homedir so credentials are read from an isolated temp dir
mock.module("node:os", () => ({
  ...nodeOs,
  homedir: () => testHome,
}));

const { NpmPublishCommand } = await import("@/commands/NpmPublishCommand");

const credentialsPath = join(testHome, ".talos", "credentials", "npm.yml");

const writeCredentials = async (token: string): Promise<void> => {
  await Bun.write(credentialsPath, `profiles:\n  default:\n    token: ${token}\n`);
};

describe("NpmPublishCommand", () => {
  let command: InstanceType<typeof NpmPublishCommand>;
  let publishMock: ReturnType<typeof mock>;
  let originalCwd: string;
  let testDir: string;

  beforeEach(() => {
    command = new NpmPublishCommand();
    errorCalls = [];
    successCalls = [];

    originalCwd = process.cwd();
    process.chdir(mkdtempSync(join(nodeOs.tmpdir(), "talos-npm-publish-cwd-")));
    // Resolve through any symlinks (e.g. macOS /var -> /private/var) so paths
    // match what the command sees via process.cwd().
    testDir = process.cwd();

    // Stub the real `bun publish` subprocess so tests never hit the network.
    publishMock = mock(() => Promise.resolve(true));
    // @ts-expect-error overriding a private method for testing
    command.publish = publishMock;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
    if (existsSync(credentialsPath)) {
      rmSync(credentialsPath);
    }
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  const scaffoldTarget = async (kind: "packages" | "modules", name: string, version = "1.0.0"): Promise<string> => {
    const dir = join(testDir, kind, name);
    mkdirSync(dir, { recursive: true });
    await Bun.write(join(dir, "package.json"), JSON.stringify({ name: `@talosjs/${name}`, version }));
    return dir;
  };

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("npm:publish");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Publish a package or module to npm");
    });
  });

  describe("run()", () => {
    test("should publish a package from the packages directory", async () => {
      await writeCredentials("npm_testtoken");
      const dir = await scaffoldTarget("packages", "cli");

      await command.run({ package: "cli", silent: true });

      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock.mock.calls[0]?.[0]).toBe(dir);
    });

    test("should publish a module from the modules directory", async () => {
      await writeCredentials("npm_testtoken");
      const dir = await scaffoldTarget("modules", "blog");

      await command.run({ module: "blog", silent: true });

      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock.mock.calls[0]?.[0]).toBe(dir);
    });

    test("should default the access level to public", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");

      await command.run({ package: "cli", silent: true });

      expect(publishMock.mock.calls[0]?.[1]).toBe("public");
    });

    test("should forward the requested access level", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");

      await command.run({ package: "cli", access: "restricted", silent: true });

      expect(publishMock.mock.calls[0]?.[1]).toBe("restricted");
    });

    test("should pass the stored token to the publish step", async () => {
      await writeCredentials("npm_storedtoken");
      await scaffoldTarget("packages", "cli");

      await command.run({ package: "cli", silent: true });

      expect(publishMock.mock.calls[0]?.[2]).toBe("npm_storedtoken");
    });

    test("should prefer the package over the module when both are given", async () => {
      await writeCredentials("npm_testtoken");
      const pkgDir = await scaffoldTarget("packages", "cli");
      await scaffoldTarget("modules", "blog");

      await command.run({ package: "cli", module: "blog", silent: true });

      expect(publishMock.mock.calls[0]?.[0]).toBe(pkgDir);
    });

    test("should log the published package name and version", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");

      await command.run({ package: "cli" });

      expect(successCalls).toHaveLength(1);
      expect(successCalls[0]).toContain("@talosjs/cli@2.3.4");
    });

    test("should fail when no target is specified", async () => {
      await writeCredentials("npm_testtoken");

      await command.run({ silent: true });

      expect(publishMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should fail when no credentials are stored", async () => {
      await scaffoldTarget("packages", "cli");

      await command.run({ package: "cli", silent: true });

      expect(publishMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should fail when the target does not exist", async () => {
      await writeCredentials("npm_testtoken");

      await command.run({ package: "missing", silent: true });

      expect(publishMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should set a failing exit code when publishing reports a failure", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");
      publishMock.mockImplementationOnce(() => Promise.resolve(false));

      await command.run({ package: "cli", silent: true });

      expect(successCalls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should set a failing exit code when publishing throws", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");
      publishMock.mockImplementationOnce(() => Promise.reject(new Error("boom")));

      await command.run({ package: "cli" });

      expect(errorCalls.some((message) => message.includes("Failed to publish"))).toBe(true);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });
  });
});
