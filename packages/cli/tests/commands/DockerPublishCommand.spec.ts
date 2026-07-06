import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-docker-publish-home-"));

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

const { DockerPublishCommand } = await import("@/commands/DockerPublishCommand");

const credentialsPath = join(testHome, ".talos", "credentials", "docker.yml");

const writeCredentials = async ({
  registry = "docker.io",
  username = "acme",
  token = "dckr_pat",
}: Partial<Record<string, string>> = {}): Promise<void> => {
  await Bun.write(
    credentialsPath,
    `profiles:\n  default:\n    registry: ${registry}\n    username: ${username}\n    token: ${token}\n`,
  );
};

describe("DockerPublishCommand", () => {
  let command: InstanceType<typeof DockerPublishCommand>;
  let publishMock: ReturnType<typeof mock>;
  let loginMock: ReturnType<typeof mock>;
  let originalCwd: string;
  let testDir: string;
  let originalWhich: typeof Bun.which;

  beforeEach(() => {
    command = new DockerPublishCommand();
    errorCalls = [];
    successCalls = [];
    infoCalls = [];

    // Pretend `docker` is installed so tests never depend on the host PATH; the
    // missing-binary case is exercised explicitly below.
    originalWhich = Bun.which;
    Bun.which = (() => "/usr/bin/docker") as typeof Bun.which;

    originalCwd = process.cwd();
    process.chdir(mkdtempSync(join(nodeOs.tmpdir(), "talos-docker-publish-cwd-")));
    // Resolve through any symlinks (e.g. macOS /var -> /private/var) so paths
    // match what the command sees via process.cwd().
    testDir = process.cwd();

    // Stub the real `docker build`/`docker push` subprocesses so tests never hit
    // the network or the docker daemon.
    publishMock = mock(() => Promise.resolve({ ok: true, output: "" }));
    // @ts-expect-error overriding a private method for testing
    command.publish = publishMock;

    // Stub the login step so tests never hit the daemon; default to success.
    loginMock = mock(() => Promise.resolve({ ok: true, output: "" }));
    // @ts-expect-error overriding a private method for testing
    command.login = loginMock;
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

  const scaffoldTarget = async (
    kind: "packages" | "modules",
    name: string,
    { dockerfile = true, version }: { dockerfile?: boolean; version?: string } = {},
  ): Promise<string> => {
    const dir = join(testDir, kind, name);
    mkdirSync(dir, { recursive: true });
    if (dockerfile) {
      await Bun.write(join(dir, "Dockerfile"), "FROM oven/bun:1\n");
    }
    if (version) {
      await Bun.write(join(dir, "package.json"), JSON.stringify({ name: `@talosjs/${name}`, version }));
    }
    return dir;
  };

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("docker:publish");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Build and push a package or module Docker image to Docker Hub");
    });
  });

  describe("run()", () => {
    test("should build and push a package that has a Dockerfile", async () => {
      await writeCredentials();
      const dir = await scaffoldTarget("packages", "cli");

      await command.run({ packages: "cli", silent: true });

      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock.mock.calls[0]?.[0]).toBe(dir);
    });

    test("should build and push a module that has a Dockerfile", async () => {
      await writeCredentials();
      const dir = await scaffoldTarget("modules", "blog");

      await command.run({ modules: "blog", silent: true });

      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock.mock.calls[0]?.[0]).toBe(dir);
    });

    test("should tag the image as <username>/<name>:latest by default", async () => {
      await writeCredentials({ username: "acme" });
      await scaffoldTarget("packages", "cli");

      await command.run({ packages: "cli", silent: true });

      expect(publishMock.mock.calls[0]?.[1]).toBe("acme/cli:latest");
    });

    test("should use the package.json version as the tag when present", async () => {
      await writeCredentials({ username: "acme" });
      await scaffoldTarget("packages", "cli", { version: "2.3.4" });

      await command.run({ packages: "cli", silent: true });

      expect(publishMock.mock.calls[0]?.[1]).toBe("acme/cli:2.3.4");
    });

    test("should let an explicit --tag override the version", async () => {
      await writeCredentials({ username: "acme" });
      await scaffoldTarget("packages", "cli", { version: "2.3.4" });

      await command.run({ packages: "cli", tag: "edge", silent: true });

      expect(publishMock.mock.calls[0]?.[1]).toBe("acme/cli:edge");
    });

    test("should prefix a non-Docker-Hub registry to the image reference", async () => {
      await writeCredentials({ registry: "ghcr.io", username: "acme" });
      await scaffoldTarget("packages", "cli");

      await command.run({ packages: "cli", silent: true });

      expect(publishMock.mock.calls[0]?.[1]).toBe("ghcr.io/acme/cli:latest");
    });

    test("should log in once before publishing", async () => {
      await writeCredentials();
      await scaffoldTarget("packages", "cli");
      await scaffoldTarget("modules", "blog");

      await command.run({ packages: "cli", modules: "blog", silent: true });

      expect(loginMock).toHaveBeenCalledTimes(1);
    });

    test("should publish both packages and modules when both flags are given", async () => {
      await writeCredentials();
      const pkgDir = await scaffoldTarget("packages", "cli");
      const modDir = await scaffoldTarget("modules", "blog");

      await command.run({ packages: "cli", modules: "blog", silent: true });

      const dirs = publishMock.mock.calls.map((call) => call[0]);
      expect(dirs).toEqual([pkgDir, modDir]);
    });

    test("should publish every package and module with a Dockerfile when no flag is given", async () => {
      await writeCredentials();
      const cliDir = await scaffoldTarget("packages", "cli");
      const blogDir = await scaffoldTarget("modules", "blog");
      // A package without a Dockerfile must be skipped during discovery.
      await scaffoldTarget("packages", "logger", { dockerfile: false });

      await command.run({ silent: true });

      const dirs = publishMock.mock.calls.map((call) => call[0]);
      expect(dirs).toHaveLength(2);
      expect(dirs).toContain(cliDir);
      expect(dirs).toContain(blogDir);
    });

    test("should count discovered targets without a Dockerfile as ignored", async () => {
      await writeCredentials();
      await scaffoldTarget("packages", "cli");
      await scaffoldTarget("packages", "logger", { dockerfile: false });

      await command.run({});

      expect(infoCalls).toContain("Summary: 1 published, 1 ignored");
    });

    test("should error when an explicitly requested target has no Dockerfile", async () => {
      await writeCredentials();
      await scaffoldTarget("packages", "logger", { dockerfile: false });

      await command.run({ packages: "logger" });

      expect(publishMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes('No Dockerfile found for package "logger"'))).toBe(true);
    });

    test("should log the published image reference", async () => {
      await writeCredentials({ username: "acme" });
      await scaffoldTarget("packages", "cli", { version: "2.3.4" });

      await command.run({ packages: "cli" });

      expect(successCalls).toHaveLength(1);
      expect(successCalls[0]).toBe("Published acme/cli:2.3.4");
    });

    test("should fail with an actionable error when docker is not installed", async () => {
      Bun.which = (() => null) as typeof Bun.which;
      await writeCredentials();
      await scaffoldTarget("packages", "cli");

      await command.run({ packages: "cli" });

      expect(loginMock).not.toHaveBeenCalled();
      expect(publishMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes("`docker` was not found"))).toBe(true);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should fail when there are no packages or modules to publish", async () => {
      await writeCredentials();

      await command.run({ silent: true });

      expect(loginMock).not.toHaveBeenCalled();
      expect(publishMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
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

      expect(errorCalls.some((message) => message.includes("No Docker credentials found"))).toBe(true);
      process.exitCode = 0;
    });

    test("should fail when login fails", async () => {
      await writeCredentials();
      await scaffoldTarget("packages", "cli");
      loginMock.mockImplementationOnce(() => Promise.resolve({ ok: false, output: "bad token" }));

      await command.run({ packages: "cli" });

      expect(publishMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes("Docker login failed"))).toBe(true);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should log an error when publishing reports a failure", async () => {
      await writeCredentials();
      await scaffoldTarget("packages", "cli");
      publishMock.mockImplementationOnce(() => Promise.resolve({ ok: false, output: "build error" }));

      await command.run({ packages: "cli" });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls.some((message) => message.includes("Failed to publish"))).toBe(true);
    });

    test("should log an error when publishing throws", async () => {
      await writeCredentials();
      await scaffoldTarget("packages", "cli");
      publishMock.mockImplementationOnce(() => Promise.reject(new Error("boom")));

      await command.run({ packages: "cli" });

      expect(errorCalls.some((message) => message.includes("Failed to publish"))).toBe(true);
      expect(successCalls).toHaveLength(0);
    });

    test("should suppress all output in silent mode", async () => {
      await writeCredentials();
      await scaffoldTarget("packages", "cli");

      await command.run({ packages: "cli", silent: true });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls).toHaveLength(0);
      expect(infoCalls).toHaveLength(0);
    });

    test("should log a summary counting published and ignored targets", async () => {
      await writeCredentials();
      await scaffoldTarget("packages", "cli");
      await scaffoldTarget("packages", "logger", { dockerfile: false });

      await command.run({ packages: "cli,logger" });

      expect(infoCalls).toContain("Summary: 1 published, 0 ignored");
      // An explicit target with no Dockerfile is reported, not silently ignored.
      expect(errorCalls.some((message) => message.includes('No Dockerfile found for package "logger"'))).toBe(true);
    });
  });

  describe("publish()", () => {
    test("should build with the local context, then push the image", async () => {
      const dir = join(testDir, "packages", "cli");
      mkdirSync(dir, { recursive: true });
      const publishCommand = new DockerPublishCommand();
      const calls: { cmd: string[]; cwd: string }[] = [];

      // @ts-expect-error overriding a private method for testing
      publishCommand.spawn = mock(async (cmd: string[], cwd: string) => {
        calls.push({ cmd, cwd });
        return { ok: true, output: "" };
      });

      // @ts-expect-error calling a private method for testing
      const result = await publishCommand.publish(dir, "acme/cli:latest", true);

      expect(result.ok).toBe(true);
      expect(calls[0]?.cmd).toEqual(["docker", "build", "-t", "acme/cli:latest", "."]);
      expect(calls[0]?.cwd).toBe(dir);
      expect(calls[1]?.cmd).toEqual(["docker", "push", "acme/cli:latest"]);
      expect(calls[1]?.cwd).toBe(dir);
    });

    test("should return false and skip the push when the build fails", async () => {
      const dir = join(testDir, "packages", "cli");
      mkdirSync(dir, { recursive: true });
      const publishCommand = new DockerPublishCommand();
      const cmds: string[][] = [];

      // @ts-expect-error overriding a private method for testing
      publishCommand.spawn = mock(async (cmd: string[]) => {
        cmds.push(cmd);
        return { ok: cmd[1] !== "build", output: "build failed" };
      });

      // @ts-expect-error calling a private method for testing
      const result = await publishCommand.publish(dir, "acme/cli:latest", true);

      expect(result.ok).toBe(false);
      expect(cmds).toEqual([["docker", "build", "-t", "acme/cli:latest", "."]]);
    });
  });

  describe("readCredentials()", () => {
    test("should return null when the username or token is missing", async () => {
      await Bun.write(credentialsPath, "profiles:\n  default:\n    registry: docker.io\n");
      const publishCommand = new DockerPublishCommand();

      // @ts-expect-error calling a private method for testing
      const credentials = await publishCommand.readCredentials();

      expect(credentials).toBeNull();
    });

    test("should default the registry to docker.io when it is omitted", async () => {
      await Bun.write(credentialsPath, "profiles:\n  default:\n    username: acme\n    token: dckr_pat\n");
      const publishCommand = new DockerPublishCommand();

      // @ts-expect-error calling a private method for testing
      const credentials = await publishCommand.readCredentials();

      expect(credentials).toEqual({ registry: "docker.io", username: "acme", token: "dckr_pat" });
    });
  });
});
