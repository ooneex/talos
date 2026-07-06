import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";

// `@/utils` transitively imports enquirer (via ModuleCreateCommand's prompts);
// mock it before importing the command so the module graph resolves.
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const logs: { info: string[]; success: string[]; error: string[] } = { info: [], success: [], error: [] };

mock.module("@talosjs/logger", () => ({
  TerminalLogger: class {
    info(message: string) {
      logs.info.push(message);
    }
    success(message: string) {
      logs.success.push(message);
    }
    error(message: string) {
      logs.error.push(message);
    }
    warn() {}
  },
}));

// Record which completion command runs after an upgrade without writing any
// files to the real home directory.
const completionRuns: string[] = [];

mock.module("@/commands/CompletionZshCommand", () => ({
  CompletionZshCommand: class {
    run() {
      completionRuns.push("zsh");
      return Promise.resolve();
    }
  },
}));

mock.module("@/commands/CompletionBashCommand", () => ({
  CompletionBashCommand: class {
    run() {
      completionRuns.push("bash");
      return Promise.resolve();
    }
  },
}));

mock.module("@/commands/CompletionFishCommand", () => ({
  CompletionFishCommand: class {
    run() {
      completionRuns.push("fish");
      return Promise.resolve();
    }
  },
}));

const { UpgradeCommand } = await import("@/commands/UpgradeCommand");

const currentVersion = (await Bun.file(join(import.meta.dir, "../../package.json")).json()).version as string;

const mockFetch = (impl: () => Promise<Response> | Response): void => {
  globalThis.fetch = mock(impl) as unknown as typeof fetch;
};

const jsonResponse = (body: unknown, ok = true): Response => ({ ok, json: async () => body }) as unknown as Response;

describe("UpgradeCommand", () => {
  let command: InstanceType<typeof UpgradeCommand>;
  const originalFetch = globalThis.fetch;
  const originalSpawn = Bun.spawn;
  const originalExitCode = process.exitCode;
  const originalShell = process.env.SHELL;

  // Real spawnStep runs, but the underlying process is faked so no `bun add -g`
  // is ever executed. Capturing here rather than stubbing @/utils keeps the mock
  // from leaking to other suites.
  let spawnCalls: string[][];
  let spawnExitCode: number;

  beforeEach(() => {
    command = new UpgradeCommand();
    logs.info.length = 0;
    logs.success.length = 0;
    logs.error.length = 0;
    spawnCalls = [];
    spawnExitCode = 0;
    completionRuns.length = 0;
    process.env.SHELL = "/bin/zsh";

    Bun.spawn = ((...args: unknown[]) => {
      spawnCalls.push(args[0] as string[]);
      return {
        stdout: "",
        stderr: "",
        exited: Promise.resolve(spawnExitCode),
      } as unknown as ReturnType<typeof Bun.spawn>;
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Bun.spawn = originalSpawn;
    // A run may set process.exitCode on failure; restore it so the test runner
    // does not inherit a non-zero exit code.
    process.exitCode = originalExitCode;
    if (originalShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = originalShell;
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("upgrade");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Upgrade the CLI to its latest version");
    });
  });

  describe("run()", () => {
    test("should report already up to date and not spawn an install", async () => {
      mockFetch(() => jsonResponse({ version: currentVersion }));

      await command.run();

      expect(logs.success[0]).toBe(`Already on the latest version (v${currentVersion})`);
      expect(spawnCalls).toHaveLength(0);
    });

    test("should spawn a global install when a newer version is available", async () => {
      mockFetch(() => jsonResponse({ version: "999.0.0" }));

      await command.run();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]).toEqual(["bun", "add", "-g", "@talosjs/cli@latest"]);
      expect(logs.info.some((line) => line.includes(`Upgrading from v${currentVersion} to v999.0.0`))).toBe(true);
      expect(logs.success.some((line) => line.includes("Upgraded to v999.0.0"))).toBe(true);
    });

    test("should print a manual command when the install fails", async () => {
      mockFetch(() => jsonResponse({ version: "999.0.0" }));
      spawnExitCode = 1;

      await command.run();

      expect(spawnCalls).toHaveLength(1);
      expect(logs.info.some((line) => line.includes("bun add -g @talosjs/cli@latest"))).toBe(true);
    });

    test("should error and set a failing exit code when the registry is unreachable", async () => {
      mockFetch(() => {
        throw new Error("network down");
      });

      await command.run();

      expect(logs.error).toHaveLength(1);
      expect(logs.error[0]).toBe("Unable to determine the latest version");
      expect(spawnCalls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
    });

    test("should treat a non-200 registry response as unreachable", async () => {
      mockFetch(() => jsonResponse({}, false));

      await command.run();

      expect(logs.error[0]).toBe("Unable to determine the latest version");
      expect(spawnCalls).toHaveLength(0);
    });
  });
});
