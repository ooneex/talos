import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-gitlab-secret-home-"));

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

const { GitlabSecretPushCommand } = await import("@/commands/GitlabSecretPushCommand");

const credentialsPath = join(testHome, ".talos", "credentials", "gitlab.yml");

const writeCredentials = async (token = "glpat-token"): Promise<void> => {
  await Bun.write(credentialsPath, `profiles:\n  default:\n    token: ${token}\n`);
};

describe("GitlabSecretPushCommand", () => {
  let command: InstanceType<typeof GitlabSecretPushCommand>;
  let pushVariableMock: ReturnType<typeof mock>;
  let originalCwd: string;
  let testDir: string;

  const writeGitConfig = async (url: string): Promise<void> => {
    await Bun.write(join(testDir, ".git", "config"), `[remote "origin"]\n\turl = ${url}\n`);
  };

  beforeEach(() => {
    command = new GitlabSecretPushCommand();
    errorCalls = [];
    successCalls = [];
    infoCalls = [];
    promptMock.mockClear();

    originalCwd = process.cwd();
    process.chdir(mkdtempSync(join(nodeOs.tmpdir(), "talos-gitlab-secret-cwd-")));
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
      expect(command.getName()).toBe("gitlab:secret:push");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Create or update a GitLab CI/CD variable on a project");
    });
  });

  describe("run()", () => {
    test("should push the variable to the project resolved from .git/config", async () => {
      await writeCredentials("glpat-token");
      await writeGitConfig("git@gitlab.com:group/project.git");

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t", silent: true });

      expect(pushVariableMock).toHaveBeenCalledTimes(1);
      expect(pushVariableMock.mock.calls[0]).toEqual([
        { host: "gitlab.com", path: "group/project" },
        "DEPLOY_TOKEN",
        "s3cr3t",
        "glpat-token",
      ]);
    });

    test("should support nested subgroups and self-managed hosts", async () => {
      await writeCredentials();
      await writeGitConfig("git@gitlab.example.com:group/subgroup/project.git");

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t", silent: true });

      expect(pushVariableMock.mock.calls[0]?.[0]).toEqual({
        host: "gitlab.example.com",
        path: "group/subgroup/project",
      });
    });

    test("should print the CI/CD settings URL and a success message when not silent", async () => {
      await writeCredentials();
      await writeGitConfig("git@gitlab.com:group/project.git");

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t" });

      expect(successCalls.some((message) => message.includes('Variable "DEPLOY_TOKEN" pushed to group/project'))).toBe(
        true,
      );
      expect(infoCalls.some((message) => message.includes("https://gitlab.com/group/project/-/settings/ci_cd"))).toBe(
        true,
      );
    });

    test("should prompt for the name and value when they are not provided", async () => {
      await writeCredentials();
      await writeGitConfig("git@gitlab.com:group/project.git");

      await command.run({ silent: true });

      expect(promptMock).toHaveBeenCalledTimes(2);
      expect(pushVariableMock.mock.calls[0]?.[1]).toBe("prompted-name");
      expect(pushVariableMock.mock.calls[0]?.[2]).toBe("prompted-value");
    });

    test("should fail when no credentials are stored", async () => {
      await writeGitConfig("git@gitlab.com:group/project.git");

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t" });

      expect(pushVariableMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes("No GitLab credentials found"))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    test("should fail when the project cannot be determined", async () => {
      await writeCredentials();

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t" });

      expect(pushVariableMock).not.toHaveBeenCalled();
      expect(errorCalls.some((message) => message.includes("Could not determine the GitLab project"))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    test("should log an error when the API reports a failure", async () => {
      await writeCredentials();
      await writeGitConfig("git@gitlab.com:group/project.git");
      pushVariableMock.mockImplementationOnce(() => Promise.resolve({ ok: false, output: "HTTP 401" }));

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t" });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls.some((message) => message.includes('Failed to push variable "DEPLOY_TOKEN"'))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    test("should suppress all output in silent mode", async () => {
      await writeCredentials();
      await writeGitConfig("git@gitlab.com:group/project.git");

      await command.run({ name: "DEPLOY_TOKEN", value: "s3cr3t", silent: true });

      expect(successCalls).toHaveLength(0);
      expect(errorCalls).toHaveLength(0);
      expect(infoCalls).toHaveLength(0);
    });
  });

  describe("parseProject()", () => {
    const cases: [string, { host: string; path: string } | null][] = [
      ["git@gitlab.com:group/project.git", { host: "gitlab.com", path: "group/project" }],
      ["https://gitlab.com/group/subgroup/project.git", { host: "gitlab.com", path: "group/subgroup/project" }],
      ["git@gitlab.example.com:team/app.git", { host: "gitlab.example.com", path: "team/app" }],
      ["ssh://git@gitlab.com/g/p", { host: "gitlab.com", path: "g/p" }],
      ["not-a-url", null],
    ];

    test.each(cases)("parses %s", (input, expected) => {
      // @ts-expect-error calling a private method for testing
      expect(command.parseProject(input)).toEqual(expected);
    });
  });

  describe("pushVariable()", () => {
    let originalFetch: typeof globalThis.fetch;
    const project = { host: "gitlab.com", path: "group/project" };

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("should create the variable with a masked POST", async () => {
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

      const pushCommand = new GitlabSecretPushCommand();
      // @ts-expect-error calling a private method for testing
      const result = await pushCommand.pushVariable(project, "KEY", "val", "tok");

      expect(result.ok).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("POST");
      expect(calls[0]?.url).toContain("/api/v4/projects/group%2Fproject/variables");
      expect(calls[0]?.headers["PRIVATE-TOKEN"]).toBe("tok");
      expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ key: "KEY", value: "val", masked: true, protected: false });
    });

    test("should update the variable with a PUT when the key already exists", async () => {
      const calls: { url: string; method: string }[] = [];
      globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ url: String(url), method });
        if (method === "POST") {
          return Promise.resolve(
            new Response(JSON.stringify({ message: { key: ["has already been taken"] } }), { status: 400 }),
          );
        }
        return Promise.resolve(new Response("", { status: 200 }));
      }) as unknown as typeof globalThis.fetch;

      const pushCommand = new GitlabSecretPushCommand();
      // @ts-expect-error calling a private method for testing
      const result = await pushCommand.pushVariable(project, "KEY", "val", "tok");

      expect(result.ok).toBe(true);
      expect(calls.map((call) => call.method)).toEqual(["POST", "PUT"]);
      expect(calls[1]?.url).toContain("/variables/KEY");
    });

    test("should surface the error when the API rejects the request", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("insufficient scope", { status: 403 }))) as unknown as typeof globalThis.fetch;

      const pushCommand = new GitlabSecretPushCommand();
      // @ts-expect-error calling a private method for testing
      const result = await pushCommand.pushVariable(project, "KEY", "val", "tok");

      expect(result.ok).toBe(false);
      expect(result.output).toContain("403");
    });
  });
});
