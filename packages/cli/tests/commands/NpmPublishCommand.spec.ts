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
  let originalWhich: typeof Bun.which;

  beforeEach(() => {
    command = new NpmPublishCommand();
    errorCalls = [];
    successCalls = [];
    infoCalls = [];

    // Pretend `npm` is installed so tests never depend on the host PATH; the
    // missing-binary case is exercised explicitly below.
    originalWhich = Bun.which;
    Bun.which = (() => "/usr/bin/npm") as typeof Bun.which;

    originalCwd = process.cwd();
    process.chdir(mkdtempSync(join(nodeOs.tmpdir(), "talos-npm-publish-cwd-")));
    // Resolve through any symlinks (e.g. macOS /var -> /private/var) so paths
    // match what the command sees via process.cwd().
    testDir = process.cwd();

    // Stub the real `npm publish` subprocess so tests never hit the network.
    publishMock = mock(() => Promise.resolve({ ok: true, output: "" }));
    // @ts-expect-error overriding a private method for testing
    command.publish = publishMock;

    // Stub the registry lookup so tests never hit the network; default to "not published".
    versionExistsMock = mock(() => Promise.resolve(false));
    // @ts-expect-error overriding a private method for testing
    command.versionExists = versionExistsMock;
  });

  afterEach(() => {
    Bun.which = originalWhich;
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

      await command.run({ packages: "cli", silent: true });

      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock.mock.calls[0]?.[0]).toBe(dir);
    });

    test("should fail with an actionable error when npm is not installed", async () => {
      Bun.which = (() => null) as typeof Bun.which;
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");

      await command.run({ packages: "cli" });

      expect(publishMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes("`npm` was not found"))).toBe(true);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should publish a module from the modules directory", async () => {
      await writeCredentials("npm_testtoken");
      const dir = await scaffoldTarget("modules", "blog");

      await command.run({ modules: "blog", silent: true });

      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock.mock.calls[0]?.[0]).toBe(dir);
    });

    test("should default the access level to public", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");

      await command.run({ packages: "cli", silent: true });

      expect(publishMock.mock.calls[0]?.[1]).toBe("public");
    });

    test("should forward the requested access level", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");

      await command.run({ packages: "cli", access: "restricted", silent: true });

      expect(publishMock.mock.calls[0]?.[1]).toBe("restricted");
    });

    test("should pass the stored token to the publish step", async () => {
      await writeCredentials("npm_storedtoken");
      await scaffoldTarget("packages", "cli");

      await command.run({ packages: "cli", silent: true });

      expect(publishMock.mock.calls[0]?.[2]).toBe("npm_storedtoken");
    });

    test("should publish both packages and modules when both flags are given", async () => {
      await writeCredentials("npm_testtoken");
      const pkgDir = await scaffoldTarget("packages", "cli");
      const modDir = await scaffoldTarget("modules", "blog");

      await command.run({ packages: "cli", modules: "blog", silent: true });

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

      await command.run({ packages: "cli,command", silent: true });

      const dirs = publishMock.mock.calls.map((call) => call[0]);
      expect(dirs).toEqual([cliDir, commandDir]);
    });

    test("should log the published package name and version", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");

      await command.run({ packages: "cli" });

      expect(successCalls).toHaveLength(1);
      expect(successCalls[0]).toBe("Published @talosjs/cli@2.3.4");
    });

    test("should pass the name@version label to the publish step", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");

      await command.run({ packages: "cli", silent: true });

      expect(publishMock.mock.calls[0]?.[3]).toBe("@talosjs/cli@2.3.4");
    });

    test("should use the scoped package.json name rather than the directory name", async () => {
      await writeCredentials("npm_testtoken");
      // Directory is `ai`, but the published name is the scoped `@talosjs/ai`.
      await scaffoldRawTarget("packages", "ai", { name: "@talosjs/ai", version: "1.2.0" });

      await command.run({ packages: "ai" });

      expect(successCalls[0]).toBe("Published @talosjs/ai@1.2.0");
    });

    test("should log the name without a version when package.json has no version", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldRawTarget("packages", "ai", { name: "@talosjs/ai" });

      await command.run({ packages: "ai" });

      expect(successCalls[0]).toBe("Published @talosjs/ai");
    });

    test("should fall back to the directory name when package.json has no name", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldRawTarget("packages", "ai", { version: "1.2.0" });

      await command.run({ packages: "ai" });

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

      await command.run({ packages: "cli", silent: true });

      expect(publishMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should log an error when no credentials are stored", async () => {
      await scaffoldTarget("packages", "cli");

      await command.run({ packages: "cli" });

      expect(errorCalls.some((message) => message.includes("No npm credentials found"))).toBe(true);
      process.exitCode = 0;
    });

    test("should log an error and skip publishing when the target does not exist", async () => {
      await writeCredentials("npm_testtoken");

      await command.run({ packages: "missing" });

      expect(publishMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes('No package named "missing" found'))).toBe(true);
    });

    test("should log an error when publishing reports a failure", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");
      publishMock.mockImplementationOnce(() => Promise.resolve({ ok: false, output: "npm error" }));

      await command.run({ packages: "cli" });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls.some((message) => message.includes("Failed to publish"))).toBe(true);
    });

    test("should log an error when publishing throws", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");
      publishMock.mockImplementationOnce(() => Promise.reject(new Error("boom")));

      await command.run({ packages: "cli" });

      expect(errorCalls.some((message) => message.includes("Failed to publish"))).toBe(true);
      expect(successCalls).toHaveLength(0);
    });

    test("should suppress all output in silent mode", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");

      await command.run({ packages: "cli", silent: true });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls).toHaveLength(0);
    });

    test("should suppress the failure message in silent mode", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");
      publishMock.mockImplementationOnce(() => Promise.resolve({ ok: false, output: "npm error" }));

      await command.run({ packages: "cli", silent: true });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls).toHaveLength(0);
    });

    test("should skip publishing when the version already exists on the registry", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");
      versionExistsMock.mockImplementationOnce(() => Promise.resolve(true));

      await command.run({ packages: "cli" });

      expect(publishMock).not.toHaveBeenCalled();
      expect(successCalls).toHaveLength(0);
      expect(errorCalls).toHaveLength(0);
    });

    test("should log that an already-published version was skipped", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");
      versionExistsMock.mockImplementationOnce(() => Promise.resolve(true));

      await command.run({ packages: "cli" });

      expect(infoCalls).toContain("Skipped @talosjs/cli@2.3.4 (already published)");
    });

    test("should suppress the skip message in silent mode", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");
      versionExistsMock.mockImplementationOnce(() => Promise.resolve(true));

      await command.run({ packages: "cli", silent: true });

      expect(infoCalls).toHaveLength(0);
    });

    test("should check the registry with the resolved name and version", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");

      await command.run({ packages: "cli" });

      expect(versionExistsMock).toHaveBeenCalledTimes(1);
      expect(versionExistsMock.mock.calls[0]?.slice(0, 2)).toEqual(["@talosjs/cli", "2.3.4"]);
    });

    test("should still publish when the package.json has no version", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldRawTarget("packages", "ai", { name: "@talosjs/ai" });

      await command.run({ packages: "ai" });

      expect(versionExistsMock).not.toHaveBeenCalled();
      expect(publishMock).toHaveBeenCalledTimes(1);
    });

    test("should log a summary counting published and ignored targets", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli", "2.3.4");
      await scaffoldTarget("packages", "ai", "1.2.0");
      versionExistsMock.mockImplementationOnce(() => Promise.resolve(true));

      await command.run({ packages: "cli,ai" });

      expect(infoCalls).toContain("Summary: 1 published, 1 ignored");
    });

    test("should suppress the summary in silent mode", async () => {
      await writeCredentials("npm_testtoken");
      await scaffoldTarget("packages", "cli");

      await command.run({ packages: "cli", silent: true });

      expect(infoCalls).toHaveLength(0);
    });
  });

  describe("publish()", () => {
    const distTarball = (dir: string): string => join(dir, "dist", "pkg-1.0.0.tgz");

    // Build a gzipped npm-style tarball (every entry nested under `package/`, as
    // `bun pm pack` produces) so extraction runs without spawning a real pack.
    const writeTarball = async (dir: string, deps: Record<string, string>): Promise<void> => {
      const archive = new Bun.Archive(
        {
          "package/package.json": JSON.stringify({ name: "@talosjs/cli", version: "1.0.0", dependencies: deps }),
          "package/dist/index.js": "console.log('build');",
        },
        { compress: "gzip" },
      );
      await Bun.write(distTarball(dir), archive);
    };

    const scaffold = (): string => {
      const dir = join(testDir, "packages", "cli");
      mkdirSync(join(dir, "dist"), { recursive: true });
      return dir;
    };

    test("should pack with bun, then publish the extracted copy with npm", async () => {
      const dir = scaffold();
      const publishCommand = new NpmPublishCommand();
      const calls: { cmd: string[]; cwd: string; token: string }[] = [];
      let extracted: { name?: string; dependencies?: Record<string, string> } | undefined;

      // @ts-expect-error overriding a private method for testing
      publishCommand.spawn = mock(async (cmd: string[], cwd: string, token: string) => {
        calls.push({ cmd, cwd, token });
        if (cmd[0] === "bun") {
          await writeTarball(dir, { "@talosjs/logger": "^1.0.0" });
        } else {
          extracted = await Bun.file(join(cwd, "package.json")).json();
        }
        return { ok: true, output: "" };
      });

      // @ts-expect-error calling a private method for testing
      const ok = await publishCommand.publish(dir, "public", "npm_tok", "@talosjs/cli@1.0.0", true);

      expect(ok.ok).toBe(true);
      // First `bun pm pack` runs in the package directory.
      expect(calls[0]?.cmd).toEqual(["bun", "pm", "pack", "--destination", "./dist"]);
      expect(calls[0]?.cwd).toBe(dir);
      // Then `npm publish` runs from the extracted dist/publish folder.
      expect(calls[1]?.cmd).toEqual(["npm", "publish", "--access", "public"]);
      expect(calls[1]?.cwd).toBe(join(dir, "dist", "publish"));
      // The tarball's `package/` prefix is stripped, so package.json lands at the
      // root of dist/publish with its workspace dependency resolved.
      expect(extracted?.name).toBe("@talosjs/cli");
      expect(extracted?.dependencies?.["@talosjs/logger"]).toBe("^1.0.0");
      // The auth token is forwarded to every spawned command.
      expect(calls.every((call) => call.token === "npm_tok")).toBe(true);
    });

    test("should forward the requested access level to npm publish", async () => {
      const dir = scaffold();
      const publishCommand = new NpmPublishCommand();
      let publishCmd: string[] | undefined;

      // @ts-expect-error overriding a private method for testing
      publishCommand.spawn = mock(async (cmd: string[]) => {
        if (cmd[0] === "bun") {
          await writeTarball(dir, {});
        } else {
          publishCmd = cmd;
        }
        return { ok: true, output: "" };
      });

      // @ts-expect-error calling a private method for testing
      await publishCommand.publish(dir, "restricted", "npm_tok", "@talosjs/cli@1.0.0", true);

      expect(publishCmd).toEqual(["npm", "publish", "--access", "restricted"]);
    });

    test("should remove the tarball and extracted folder after publishing", async () => {
      const dir = scaffold();
      const publishCommand = new NpmPublishCommand();
      // @ts-expect-error overriding a private method for testing
      publishCommand.spawn = mock(async (cmd: string[]) => {
        if (cmd[0] === "bun") {
          await writeTarball(dir, {});
        }
        return { ok: true, output: "" };
      });

      // @ts-expect-error calling a private method for testing
      await publishCommand.publish(dir, "public", "npm_tok", "@talosjs/cli@1.0.0", true);

      expect(existsSync(join(dir, "dist", "publish"))).toBe(false);
      expect(existsSync(distTarball(dir))).toBe(false);
    });

    test("should clear a stale publish folder before packing", async () => {
      const dir = scaffold();
      // A leftover from a previous run that must not survive into the new publish.
      mkdirSync(join(dir, "dist", "publish"), { recursive: true });
      await Bun.write(join(dir, "dist", "publish", "stale.txt"), "old");

      const publishCommand = new NpmPublishCommand();
      let staleSeen = true;
      // @ts-expect-error overriding a private method for testing
      publishCommand.spawn = mock(async (cmd: string[]) => {
        if (cmd[0] === "bun") {
          staleSeen = existsSync(join(dir, "dist", "publish", "stale.txt"));
          await writeTarball(dir, {});
        }
        return { ok: true, output: "" };
      });

      // @ts-expect-error calling a private method for testing
      await publishCommand.publish(dir, "public", "npm_tok", "@talosjs/cli@1.0.0", true);

      expect(staleSeen).toBe(false);
    });

    test("should return false and skip npm publish when packing fails", async () => {
      const dir = scaffold();
      const publishCommand = new NpmPublishCommand();
      const cmds: string[][] = [];
      // @ts-expect-error overriding a private method for testing
      publishCommand.spawn = mock(async (cmd: string[]) => {
        cmds.push(cmd);
        return { ok: cmd[0] !== "bun", output: "pack failed" }; // packing fails
      });

      // @ts-expect-error calling a private method for testing
      const ok = await publishCommand.publish(dir, "public", "npm_tok", "@talosjs/cli@1.0.0", true);

      expect(ok.ok).toBe(false);
      expect(cmds).toEqual([["bun", "pm", "pack", "--destination", "./dist"]]);
    });

    test("should return false when packing produces no tarball", async () => {
      const dir = scaffold();
      const publishCommand = new NpmPublishCommand();
      const cmds: string[][] = [];
      // @ts-expect-error overriding a private method for testing
      publishCommand.spawn = mock(async (cmd: string[]) => {
        cmds.push(cmd);
        return { ok: true, output: "" }; // reports success but writes no tarball
      });

      // @ts-expect-error calling a private method for testing
      const ok = await publishCommand.publish(dir, "public", "npm_tok", "@talosjs/cli@1.0.0", true);

      expect(ok.ok).toBe(false);
      // npm publish is never reached because there is no tarball to extract.
      expect(cmds).toEqual([["bun", "pm", "pack", "--destination", "./dist"]]);
    });
  });
});
