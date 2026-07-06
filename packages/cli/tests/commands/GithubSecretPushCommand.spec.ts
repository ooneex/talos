import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-github-secret-home-"));

// Prompts return a value that depends on the prompt kind so the name (input) and
// value (masked password) can be told apart in assertions.
const promptMock = mock((config: { type?: string }) =>
  Promise.resolve({ value: config?.type === "password" ? "prompted-value" : "prompted-name" }),
);

mock.module("enquirer", () => ({
  prompt: promptMock,
}));

let errorCalls: string[] = [];
let successCalls: string[] = [];
let infoCalls: string[] = [];

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

const { GithubSecretPushCommand } = await import("@/commands/GithubSecretPushCommand");

const credentialsPath = join(testHome, ".talos", "credentials", "github.yml");

const writeCredentials = async (token = "ghp_token"): Promise<void> => {
  await Bun.write(credentialsPath, `profiles:\n  default:\n    token: ${token}\n`);
};

describe("GithubSecretPushCommand", () => {
  let command: InstanceType<typeof GithubSecretPushCommand>;
  let pushSecretMock: ReturnType<typeof mock>;
  let originalCwd: string;
  let testDir: string;
  let originalWhich: typeof Bun.which;

  const writeGitConfig = async (url: string): Promise<void> => {
    await Bun.write(join(testDir, ".git", "config"), `[remote "origin"]\n\turl = ${url}\n`);
  };

  beforeEach(() => {
    command = new GithubSecretPushCommand();
    errorCalls = [];
    successCalls = [];
    infoCalls = [];
    promptMock.mockClear();

    // Pretend `gh` is installed so tests never depend on the host PATH.
    originalWhich = Bun.which;
    Bun.which = (() => "/usr/bin/gh") as typeof Bun.which;

    originalCwd = process.cwd();
    process.chdir(mkdtempSync(join(nodeOs.tmpdir(), "talos-github-secret-cwd-")));
    testDir = process.cwd();

    // Stub the real `gh secret set` subprocess so tests never hit the network.
    pushSecretMock = mock(() => Promise.resolve({ ok: true, output: "" }));
    // @ts-expect-error overriding a private method for testing
    command.pushSecret = pushSecretMock;
  });

  afterEach(() => {
    Bun.which = originalWhich;
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
    if (existsSync(credentialsPath)) {
      rmSync(credentialsPath);
    }
    process.exitCode = 0;
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("github:secret:push");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Create or update a GitHub Actions secret on a repository");
    });
  });

  describe("run()", () => {
    test("should push the secret to the repository resolved from .git/config", async () => {
      await writeCredentials("ghp_token");
      await writeGitConfig("git@github.com:ooneex/talos.git");

      await command.run({ name: "MY_SECRET", value: "s3cr3t", silent: true });

      expect(pushSecretMock).toHaveBeenCalledTimes(1);
      expect(pushSecretMock.mock.calls[0]).toEqual(["ooneex/talos", "MY_SECRET", "s3cr3t", "ghp_token"]);
    });

    test("should resolve an https remote to the owner/repo slug", async () => {
      await writeCredentials();
      await writeGitConfig("https://github.com/ooneex/talos.git");

      await command.run({ name: "MY_SECRET", value: "s3cr3t", silent: true });

      expect(pushSecretMock.mock.calls[0]?.[0]).toBe("ooneex/talos");
    });

    test("should print the settings URL and a success message when not silent", async () => {
      await writeCredentials();
      await writeGitConfig("git@github.com:ooneex/talos.git");

      await command.run({ name: "MY_SECRET", value: "s3cr3t" });

      expect(successCalls.some((message) => message.includes('Secret "MY_SECRET" pushed to ooneex/talos'))).toBe(true);
      expect(
        infoCalls.some((message) => message.includes("https://github.com/ooneex/talos/settings/secrets/actions")),
      ).toBe(true);
    });

    test("should prompt for the name and value when they are not provided", async () => {
      await writeCredentials();
      await writeGitConfig("git@github.com:ooneex/talos.git");

      await command.run({ silent: true });

      expect(promptMock).toHaveBeenCalledTimes(2);
      expect(pushSecretMock.mock.calls[0]?.[1]).toBe("prompted-name");
      expect(pushSecretMock.mock.calls[0]?.[2]).toBe("prompted-value");
    });

    test("should mask the value prompt", async () => {
      await writeCredentials();
      await writeGitConfig("git@github.com:ooneex/talos.git");

      await command.run({ name: "MY_SECRET", silent: true });

      const valuePrompt = promptMock.mock.calls.at(-1)?.[0] as { type?: string };
      expect(valuePrompt?.type).toBe("password");
    });

    test("should fail with an actionable error when gh is not installed", async () => {
      Bun.which = (() => null) as typeof Bun.which;
      await writeCredentials();
      await writeGitConfig("git@github.com:ooneex/talos.git");

      await command.run({ name: "MY_SECRET", value: "s3cr3t" });

      expect(pushSecretMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes("`gh` was not found"))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    test("should fail when no credentials are stored", async () => {
      await writeGitConfig("git@github.com:ooneex/talos.git");

      await command.run({ name: "MY_SECRET", value: "s3cr3t" });

      expect(pushSecretMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes("No GitHub credentials found"))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    test("should fail when the repository cannot be determined", async () => {
      await writeCredentials();

      await command.run({ name: "MY_SECRET", value: "s3cr3t" });

      expect(pushSecretMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes("Could not determine the GitHub repository"))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    test("should fail when the origin remote is not a GitHub repository", async () => {
      await writeCredentials();
      await writeGitConfig("git@example.com:not-a-repo");

      await command.run({ name: "MY_SECRET", value: "s3cr3t" });

      expect(pushSecretMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes("Could not determine the GitHub repository"))).toBe(true);
    });

    test("should log an error when pushing reports a failure", async () => {
      await writeCredentials();
      await writeGitConfig("git@github.com:ooneex/talos.git");
      pushSecretMock.mockImplementationOnce(() => Promise.resolve({ ok: false, output: "HTTP 403" }));

      await command.run({ name: "MY_SECRET", value: "s3cr3t" });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls.some((message) => message.includes('Failed to push secret "MY_SECRET" to ooneex/talos'))).toBe(
        true,
      );
      expect(process.exitCode).toBe(1);
    });

    test("should suppress all output in silent mode", async () => {
      await writeCredentials();
      await writeGitConfig("git@github.com:ooneex/talos.git");

      await command.run({ name: "MY_SECRET", value: "s3cr3t", silent: true });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls).toHaveLength(0);
      expect(infoCalls).toHaveLength(0);
    });
  });

  describe("normalizeRepository()", () => {
    const cases: [string, string | null][] = [
      ["git@github.com:ooneex/talos.git", "ooneex/talos"],
      ["https://github.com/ooneex/talos", "ooneex/talos"],
      ["https://github.com/ooneex/talos.git", "ooneex/talos"],
      ["ssh://git@github.com/ooneex/talos.git", "ooneex/talos"],
      ["ooneex/talos", "ooneex/talos"],
      ["not-a-repo", null],
    ];

    test.each(cases)("normalizes %s", (input, expected) => {
      // @ts-expect-error calling a private method for testing
      expect(command.normalizeRepository(input)).toBe(expected);
    });
  });

  describe("pushSecret()", () => {
    let originalSpawn: typeof Bun.spawn;

    beforeEach(() => {
      originalSpawn = Bun.spawn;
    });

    afterEach(() => {
      Bun.spawn = originalSpawn;
    });

    test("should run gh secret set, feeding the value via stdin and the token via GH_TOKEN", async () => {
      const calls: { cmd: string[]; opts: { stdin?: Uint8Array; env?: Record<string, string> } }[] = [];
      Bun.spawn = ((cmd: string[], opts: { stdin?: Uint8Array; env?: Record<string, string> }) => {
        calls.push({ cmd, opts });
        return { stdout: "", stderr: "", exited: Promise.resolve(0) };
      }) as unknown as typeof Bun.spawn;

      const pushCommand = new GithubSecretPushCommand();
      // @ts-expect-error calling a private method for testing
      const result = await pushCommand.pushSecret("ooneex/talos", "MY_SECRET", "s3cr3t", "ghp_tok");

      expect(result.ok).toBe(true);
      expect(calls[0]?.cmd).toEqual(["gh", "secret", "set", "MY_SECRET", "--repo", "ooneex/talos"]);
      expect(calls[0]?.opts.env?.GH_TOKEN).toBe("ghp_tok");
      expect(new TextDecoder().decode(calls[0]?.opts.stdin)).toBe("s3cr3t");
    });

    test("should return ok:false with the captured output when gh exits non-zero", async () => {
      Bun.spawn = (() => ({
        stdout: "",
        stderr: "HTTP 403: Resource not accessible",
        exited: Promise.resolve(1),
      })) as unknown as typeof Bun.spawn;

      const pushCommand = new GithubSecretPushCommand();
      // @ts-expect-error calling a private method for testing
      const result = await pushCommand.pushSecret("ooneex/talos", "MY_SECRET", "s3cr3t", "ghp_tok");

      expect(result.ok).toBe(false);
      expect(result.output).toContain("HTTP 403");
    });
  });

  describe("explainFailure()", () => {
    test("should pass non-permission output through unchanged", () => {
      // @ts-expect-error calling a private method for testing
      expect(command.explainFailure("some unrelated error")).toBe("some unrelated error");
    });

    test("should append permission guidance on an HTTP 403", () => {
      // @ts-expect-error calling a private method for testing
      const message = command.explainFailure("HTTP 403: Resource not accessible by personal access token");
      expect(message).toContain("Secrets");
      expect(message).toContain("github:credentials:create");
    });
  });
});
