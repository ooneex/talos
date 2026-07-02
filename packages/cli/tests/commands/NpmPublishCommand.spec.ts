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
let infoCalls: string[] = [];

// Mock logger to capture output
mock.module("@talosjs/logger", () => ({
  TerminalLogger: class {
    init() {}
    info(message: string) {
      infoCalls.push(message);
    }
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
  let versionExistsMock: ReturnType<typeof mock>;
  let originalCwd: string;
  let testDir: string;

  beforeEach(() => {
    command = new NpmPublishCommand();
    errorCalls = [];
    successCalls = [];
    infoCalls = [];

    originalCwd = process.cwd();
    process.chdir(mkdtempSync(join(nodeOs.tmpdir(), "talos-npm-publish-cwd-")));
    // Resolve through any symlinks (e.g. macOS /var -> /private/var) so paths
    // match what the command sees via process.cwd().
    testDir = process.cwd();

    // Stub the real `npm publish` subprocess so tests never hit the network.
    publishMock = mock(() => Promise.resolve(true));
    // @ts-expect-error overriding a private method for testing
    command.publish = publishMock;

    // Stub the registry lookup so tests never hit the network; default to "not published".
    versionExistsMock = mock(() => Promise.resolve(false));
    // @ts-expect-error overriding a private method for testing
    command.versionExists = versionExistsMock;
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

  const scaffoldRawTarget = async (
    kind: "packages" | "modules",
    dirName: string,
    pkgJson: Record<string, unknown>,
  ): Promise<string> => {
    const dir = join(testDir, kind, dirName);
    mkdirSync(dir, { recursive: true });
    await Bun.write(join(dir, "package.json"), JSON.stringify(pkgJson));
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

    test("should publish both packages and modules when both flags are given", async () => {
      await writeCredentials("npm_testtoken");
      const pkgDir = await scaffoldTarget("packages", "cli");
      const modDir = await scaffoldTarget("modules", "blog");

      await command.run({ package: "cli", module: "blog", silent: true });

      const dirs = publishMock.mock.calls.map((call) => call[0]);
      expect(dirs).toEqual([pkgDir, modDir]);
    });

    test("should publish every package and module when no target flag is given", async () => {
      await writeCredentials("npm_testtoken");
      const cliDir = await scaffoldTarget("packages", "cli");
      const commandDir = await scaffoldTarget("packages", "command");
      const blogDir = await scaffoldTarget("modules", "blog");

      await command.run({ silent: true });

      const dirs = publishMock.mock.calls.map((call) => call[0]);
      expect(dirs).toHaveLength(3);
      expect(dirs).toContain(cliDir);
      expect(dirs).toContain(commandDir);
      expect(dirs).toContain(blogDir);
    });

    test("should publish multiple packages from a comma-separated list", async () => {
      await writeCredentials("npm_testtoken");
      const cliDir = await scaffoldTarget("packages", "cli");
      const commandDir = await scaffoldTarget("packages", "command");
      // A third package that must be skipped because it is not requested.
      await scaffoldTarget("packages", "logger");

      await command.run({ package: "cli,command", silent: true });

      const dirs = publishMock.mock.calls.map((call) => call[0]);
      expect(dirs).toEqual([cliDir, commandDir]);
    });

    test("should log the published package name and version", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");

      await command.run({ package: "cli" });

      expect(successCalls).toHaveLength(1);
      expect(successCalls[0]).toBe("Published @talosjs/cli@2.3.4");
    });

    test("should pass the name@version label to the publish step", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");

      await command.run({ package: "cli", silent: true });

      expect(publishMock.mock.calls[0]?.[3]).toBe("@talosjs/cli@2.3.4");
    });

    test("should use the scoped package.json name rather than the directory name", async () => {
      await writeCredentials("npm_testtoken");
      // Directory is `ai`, but the published name is the scoped `@talosjs/ai`.
      await scaffoldRawTarget("packages", "ai", { name: "@talosjs/ai", version: "1.2.0" });

      await command.run({ package: "ai" });

      expect(successCalls[0]).toBe("Published @talosjs/ai@1.2.0");
    });

    test("should log the name without a version when package.json has no version", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldRawTarget("packages", "ai", { name: "@talosjs/ai" });

      await command.run({ package: "ai" });

      expect(successCalls[0]).toBe("Published @talosjs/ai");
    });

    test("should fall back to the directory name when package.json has no name", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldRawTarget("packages", "ai", { version: "1.2.0" });

      await command.run({ package: "ai" });

      expect(successCalls[0]).toBe("Published ai@1.2.0");
    });

    test("should fail when there are no packages or modules to publish", async () => {
      await writeCredentials("npm_testtoken");

      await command.run({ silent: true });

      expect(publishMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should log an error when there are no packages or modules to publish", async () => {
      await writeCredentials("npm_testtoken");

      await command.run({});

      expect(errorCalls.some((message) => message.includes("No packages or modules found to publish"))).toBe(true);
      process.exitCode = 0;
    });

    test("should fail when no credentials are stored", async () => {
      await scaffoldTarget("packages", "cli");

      await command.run({ package: "cli", silent: true });

      expect(publishMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should log an error when no credentials are stored", async () => {
      await scaffoldTarget("packages", "cli");

      await command.run({ package: "cli" });

      expect(errorCalls.some((message) => message.includes("No npm credentials found"))).toBe(true);
      process.exitCode = 0;
    });

    test("should log an error and skip publishing when the target does not exist", async () => {
      await writeCredentials("npm_testtoken");

      await command.run({ package: "missing" });

      expect(publishMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes('No package named "missing" found'))).toBe(true);
    });

    test("should log an error when publishing reports a failure", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");
      publishMock.mockImplementationOnce(() => Promise.resolve(false));

      await command.run({ package: "cli" });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls.some((message) => message.includes("Failed to publish"))).toBe(true);
    });

    test("should log an error when publishing throws", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");
      publishMock.mockImplementationOnce(() => Promise.reject(new Error("boom")));

      await command.run({ package: "cli" });

      expect(errorCalls.some((message) => message.includes("Failed to publish"))).toBe(true);
      expect(successCalls).toHaveLength(0);
    });

    test("should suppress all output in silent mode", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");

      await command.run({ package: "cli", silent: true });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls).toHaveLength(0);
    });

    test("should suppress the failure message in silent mode", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");
      publishMock.mockImplementationOnce(() => Promise.resolve(false));

      await command.run({ package: "cli", silent: true });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls).toHaveLength(0);
    });

    test("should skip publishing when the version already exists on the registry", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");
      versionExistsMock.mockImplementationOnce(() => Promise.resolve(true));

      await command.run({ package: "cli" });

      expect(publishMock).not.toHaveBeenCalled();
      expect(successCalls).toHaveLength(0);
      expect(errorCalls).toHaveLength(0);
    });

    test("should check the registry with the resolved name and version", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");

      await command.run({ package: "cli" });

      expect(versionExistsMock).toHaveBeenCalledTimes(1);
      expect(versionExistsMock.mock.calls[0]?.slice(0, 2)).toEqual(["@talosjs/cli", "2.3.4"]);
    });

    test("should still publish when the package.json has no version", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldRawTarget("packages", "ai", { name: "@talosjs/ai" });

      await command.run({ package: "ai" });

      expect(versionExistsMock).not.toHaveBeenCalled();
      expect(publishMock).toHaveBeenCalledTimes(1);
    });

    test("should log a summary counting published and ignored targets", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");
      await scaffoldTarget("packages", "ai", "1.2.0");
      versionExistsMock.mockImplementationOnce(() => Promise.resolve(true));

      await command.run({ package: "cli,ai" });

      expect(infoCalls).toContain("Summary: 1 published, 1 ignored");
    });

    test("should suppress the summary in silent mode", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");

      await command.run({ package: "cli", silent: true });

      expect(infoCalls).toHaveLength(0);
    });
  });
});
