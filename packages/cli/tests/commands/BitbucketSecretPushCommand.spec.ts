import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-bitbucket-secret-home-"));

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

mock.module("node:os", () => ({
  ...nodeOs,
  homedir: () => testHome,
}));

const { BitbucketSecretPushCommand } = await import("@/commands/BitbucketSecretPushCommand");

const credentialsPath = join(testHome, ".talos", "credentials", "bitbucket.yml");

const writeCredentials = async (username = "acme", token = "ATBB-secret"): Promise<void> => {
  await Bun.write(credentialsPath, `profiles:\n  default:\n    username: ${username}\n    token: ${token}\n`);
};

describe("BitbucketSecretPushCommand", () => {
  let command: InstanceType<typeof BitbucketSecretPushCommand>;
  let pushVariableMock: ReturnType<typeof mock>;
  let originalCwd: string;
  let testDir: string;

  const writeGitConfig = async (url: string): Promise<void> => {
    await Bun.write(join(testDir, ".git", "config"), `[remote "origin"]\n\turl = ${url}\n`);
  };

  beforeEach(() => {
    command = new BitbucketSecretPushCommand();
    errorCalls = [];
    successCalls = [];
    infoCalls = [];
    promptMock.mockClear();

    originalCwd = process.cwd();
    process.chdir(mkdtempSync(join(nodeOs.tmpdir(), "talos-bitbucket-secret-cwd-")));
    testDir = process.cwd();

    // Stub the API call so run() tests never hit the network.
    pushVariableMock = mock(() => Promise.resolve({ ok: true, output: "" }));
    // @ts-expect-error overriding a private method for testing
    command.pushVariable = pushVariableMock;
  });

  afterEach(() => {
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
      expect(command.getName()).toBe("bitbucket:secret:push");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Create or update a Bitbucket Pipelines repository variable");
    });
  });

  describe("run()", () => {
    test("should push the variable to the repository resolved from .git/config", async () => {
      await writeCredentials("acme", "ATBB-secret");
      await writeGitConfig("git@bitbucket.org:team/repo.git");

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t", silent: true });

      expect(pushVariableMock).toHaveBeenCalledTimes(1);
      expect(pushVariableMock.mock.calls[0]).toEqual([
        { workspace: "team", slug: "repo" },
        "DEPLOY_TOKEN",
        "s3cr3t",
        { username: "acme", token: "ATBB-secret" },
      ]);
    });

    test("should print the variables settings URL and a success message when not silent", async () => {
      await writeCredentials();
      await writeGitConfig("https://acme@bitbucket.org/team/repo.git");

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t" });

      expect(successCalls.some((message) => message.includes('Variable "DEPLOY_TOKEN" pushed to team/repo'))).toBe(
        true,
      );
      expect(
        infoCalls.some((message) =>
          message.includes("https://bitbucket.org/team/repo/admin/pipelines/repository-variables"),
        ),
      ).toBe(true);
    });

    test("should prompt for the name and value when they are not provided", async () => {
      await writeCredentials();
      await writeGitConfig("git@bitbucket.org:team/repo.git");

      await command.run({ silent: true });

      expect(promptMock).toHaveBeenCalledTimes(2);
      expect(pushVariableMock.mock.calls[0]?.[1]).toBe("prompted-name");
      expect(pushVariableMock.mock.calls[0]?.[2]).toBe("prompted-value");
    });

    test("should fail when no credentials are stored", async () => {
      await writeGitConfig("git@bitbucket.org:team/repo.git");

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t" });

      expect(pushVariableMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes("No Bitbucket credentials found"))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    test("should fail when the credentials file is missing the username or token", async () => {
      await Bun.write(credentialsPath, "profiles:\n  default:\n    username: acme\n");
      await writeGitConfig("git@bitbucket.org:team/repo.git");

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t" });

      expect(pushVariableMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes("No Bitbucket credentials found"))).toBe(true);
    });

    test("should fail when the repository cannot be determined", async () => {
      await writeCredentials();

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t" });

      expect(pushVariableMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes("Could not determine the Bitbucket repository"))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    test("should log an error when the API reports a failure", async () => {
      await writeCredentials();
      await writeGitConfig("git@bitbucket.org:team/repo.git");
      pushVariableMock.mockImplementationOnce(() => Promise.resolve({ ok: false, output: "HTTP 401" }));

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t" });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls.some((message) => message.includes('Failed to push variable "DEPLOY_TOKEN"'))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    test("should suppress all output in silent mode", async () => {
      await writeCredentials();
      await writeGitConfig("git@bitbucket.org:team/repo.git");

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t", silent: true });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls).toHaveLength(0);
      expect(infoCalls).toHaveLength(0);
    });
  });

  describe("parseRepository()", () => {
    const cases: [string, { workspace: string; slug: string } | null][] = [
      ["git@bitbucket.org:team/repo.git", { workspace: "team", slug: "repo" }],
      ["https://acme@bitbucket.org/team/repo.git", { workspace: "team", slug: "repo" }],
      ["https://bitbucket.org/a/b/c", null],
      ["not-a-url", null],
    ];

    test.each(cases)("parses %s", (input, expected) => {
      // @ts-expect-error calling a private method for testing
      expect(command.parseRepository(input)).toEqual(expected);
    });
  });

  describe("pushVariable()", () => {
    let originalFetch: typeof globalThis.fetch;
    const repo = { workspace: "team", slug: "repo" };
    const credentials = { username: "acme", token: "ATBB-secret" };

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("should create the variable with a secured POST using Basic auth", async () => {
      const calls: { url: string; method: string; body: string; headers: Record<string, string> }[] = [];
      globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
        calls.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: String(init?.body ?? ""),
          headers: (init?.headers ?? {}) as Record<string, string>,
        });
        return Promise.resolve(new Response("", { status: 201 }));
      }) as unknown as typeof globalThis.fetch;

      const pushCommand = new BitbucketSecretPushCommand();
      // @ts-expect-error calling a private method for testing
      const result = await pushCommand.pushVariable(repo, "KEY", "val", credentials);

      expect(result.ok).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("POST");
      expect(calls[0]?.url).toContain("/repositories/team/repo/pipelines_config/variables/");
      expect(calls[0]?.headers.Authorization).toBe(`Basic ${Buffer.from("acme:ATBB-secret").toString("base64")}`);
      expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ key: "KEY", value: "val", secured: true });
    });

    test("should look up the UUID and PUT when the variable already exists", async () => {
      const calls: { url: string; method: string }[] = [];
      globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ url: String(url), method });
        if (method === "POST") {
          return Promise.resolve(new Response("", { status: 409 }));
        }
        if (method === "GET") {
          return Promise.resolve(
            new Response(JSON.stringify({ values: [{ uuid: "{abc}", key: "KEY" }] }), { status: 200 }),
          );
        }
        return Promise.resolve(new Response("", { status: 200 }));
      }) as unknown as typeof globalThis.fetch;

      const pushCommand = new BitbucketSecretPushCommand();
      // @ts-expect-error calling a private method for testing
      const result = await pushCommand.pushVariable(repo, "KEY", "val", credentials);

      expect(result.ok).toBe(true);
      expect(calls.map((call) => call.method)).toEqual(["POST", "GET", "PUT"]);
      expect(calls[2]?.url).toContain("/variables/{abc}");
    });

    test("should surface the error when the API rejects the request", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("no access", { status: 403 }))) as unknown as typeof globalThis.fetch;

      const pushCommand = new BitbucketSecretPushCommand();
      // @ts-expect-error calling a private method for testing
      const result = await pushCommand.pushVariable(repo, "KEY", "val", credentials);

      expect(result.ok).toBe(false);
      expect(result.output).toContain("403");
    });
  });
});
