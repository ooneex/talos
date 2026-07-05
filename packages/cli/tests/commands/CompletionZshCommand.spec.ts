import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-completion-"));

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

// Mock homedir so completion files are written to an isolated temp dir
mock.module("node:os", () => ({
  ...nodeOs,
  homedir: () => testHome,
}));

const { CompletionZshCommand } = await import("@/commands/CompletionZshCommand");

describe("CompletionZshCommand", () => {
  let command: InstanceType<typeof CompletionZshCommand>;
  let completionDir: string;

  beforeEach(() => {
    command = new CompletionZshCommand();
    completionDir = join(testHome, ".zsh");
  });

  afterEach(() => {
    const ooFilePath = join(completionDir, "_oo");
    const talosFilePath = join(completionDir, "_talos");

    if (existsSync(ooFilePath)) {
      rmSync(ooFilePath);
    }
    if (existsSync(talosFilePath)) {
      rmSync(talosFilePath);
    }
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("completion:zsh");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Install Zsh completion for oo command");
    });
  });

  describe("run()", () => {
    test("should generate _oo completion file", async () => {
      await command.run();

      const filePath = join(completionDir, "_oo");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("#compdef oo");
      expect(content).toContain("_oo()");
      expect(content).toContain('_talos "$@"');
    });

    test("should generate _talos completion file", async () => {
      await command.run();

      const filePath = join(completionDir, "_talos");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("#compdef oo talos");
      expect(content).toContain("_talos()");
    });

    test("should include all commands in _oo completion", async () => {
      await command.run();

      const ooContent = await Bun.file(join(completionDir, "_oo")).text();
      const talosContent = await Bun.file(join(completionDir, "_talos")).text();

      // _oo delegates to _talos which has all commands
      expect(ooContent).toContain('_talos "$@"');
      expect(talosContent).toContain("ai\\:chat\\:create");
      expect(talosContent).toContain("controller\\:create");
      expect(talosContent).toContain("module\\:create");
      expect(talosContent).toContain("service\\:create");
    });

    test("should include all commands in _talos completion", async () => {
      await command.run();

      const content = await Bun.file(join(completionDir, "_talos")).text();
      expect(content).toContain("ai\\:chat\\:create");
      expect(content).toContain("controller\\:create");
      expect(content).toContain("module\\:create");
      expect(content).toContain("service\\:create");
    });

    test("should include argument definitions in completions", async () => {
      await command.run();

      const content = await Bun.file(join(completionDir, "_talos")).text();
      expect(content).toContain("--name=");
      expect(content).toContain("--route-name=");
      expect(content).toContain("--route-path=");
      expect(content).toContain("--route-method=");
      expect(content).toContain("--is-socket");
      expect(content).toContain("--destination=");
      expect(content).toContain("--channel=");
      expect(content).toContain("--table-name=");
      expect(content).toContain("--module=");
    });

    test("should include module completion helper function in _oo", async () => {
      await command.run();

      const ooContent = await Bun.file(join(completionDir, "_oo")).text();
      const talosContent = await Bun.file(join(completionDir, "_talos")).text();

      // _oo delegates to _talos which provides module completion
      expect(ooContent).toContain('_talos "$@"');
      expect(talosContent).toContain("_talos_modules()");
      expect(talosContent).toContain("command ls -1 modules");
    });

    test("should include module completion helper function in _talos", async () => {
      await command.run();

      const content = await Bun.file(join(completionDir, "_talos")).text();
      expect(content).toContain("_talos_modules()");
      expect(content).toContain("command ls -1 modules");
    });

    const caseBody = (content: string, pattern: string): string => {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = content.match(new RegExp(`\\n\\s*${escaped}\\)\\s*\\n([\\s\\S]*?)\\n\\s*;;`));
      expect(match).not.toBeNull();
      return match?.[1] ?? "";
    };

    test("should include --drop and --no-cache options for migration:up command", async () => {
      await command.run();

      const talosContent = await Bun.file(join(completionDir, "_talos")).text();
      expect(caseBody(talosContent, "migration:up")).toContain("--drop");
      expect(caseBody(talosContent, "migration:up")).toContain("--no-cache");
    });

    test("should include --drop option for seed:run command", async () => {
      await command.run();

      const talosContent = await Bun.file(join(completionDir, "_talos")).text();
      expect(caseBody(talosContent, "seed:run")).toContain("--drop");
    });

    test("should include --version option for migration:down command", async () => {
      await command.run();

      const talosContent = await Bun.file(join(completionDir, "_talos")).text();
      expect(caseBody(talosContent, "migration:down")).toContain("--version=");
    });

    test("should not include --module option for excluded commands", async () => {
      await command.run();

      const talosContent = await Bun.file(join(completionDir, "_talos")).text();

      // completion:zsh and related commands should have no options at all
      const noOptsMatch = talosContent.match(/completion:zsh\|help\|version\|upgrade\)\s*;;/);
      expect(noOptsMatch).not.toBeNull();

      // module:create should only have --name, not --module
      const moduleBody = caseBody(talosContent, "module:create");
      expect(moduleBody).toContain("--name=");
      expect(moduleBody).not.toContain("--module=");

      // app:create should only have --name, not --module
      const appBody = caseBody(talosContent, "app:create");
      expect(appBody).toContain("--name=");
      expect(appBody).not.toContain("--module=");

      // docker:create should not have --module and no talos-jade
      const dockerBody = caseBody(talosContent, "docker:create");
      expect(dockerBody).toContain("--name=");
      expect(dockerBody).not.toContain("--module=");
      expect(dockerBody).not.toContain("talos-jade");
    });

    test("should use correct description for app:create", async () => {
      await command.run();

      const ooContent = await Bun.file(join(completionDir, "_oo")).text();
      const talosContent = await Bun.file(join(completionDir, "_talos")).text();

      // _oo delegates to _talos which has the descriptions
      expect(ooContent).toContain('_talos "$@"');
      expect(talosContent).toContain("app\\:create:Create a new application");
    });

    test("should include credential commands with their descriptions", async () => {
      await command.run();

      const talosContent = await Bun.file(join(completionDir, "_talos")).text();
      expect(talosContent).toContain(
        "docker\\:credentials\\:create:Save a Docker registry access token under the user config",
      );
      expect(talosContent).toContain(
        "github\\:credentials\\:create:Save a GitHub Personal Access Token under the user config",
      );
      expect(talosContent).toContain("jira\\:credentials\\:create:Save a Jira API token under the user config");
      expect(talosContent).toContain(
        "linear\\:credentials\\:create:Save a Linear Personal API key under the user config",
      );
      expect(talosContent).toContain(
        "npm\\:credentials\\:create:Save an npm Granular Access Token under the user config",
      );
    });

    test("should include registry, username and token options for docker:credentials:create", async () => {
      await command.run();

      const talosContent = await Bun.file(join(completionDir, "_talos")).text();
      const body = caseBody(talosContent, "docker:credentials:create");
      expect(body).toContain("--registry=");
      expect(body).toContain("--username=");
      expect(body).toContain("--token=");
    });

    test("should include the token option for github:credentials:create", async () => {
      await command.run();

      const talosContent = await Bun.file(join(completionDir, "_talos")).text();
      const body = caseBody(talosContent, "github:credentials:create");
      expect(body).toContain("--token=");
      expect(body).not.toContain("--module=");
    });

    test("should include base-url, email and token options for jira:credentials:create", async () => {
      await command.run();

      const talosContent = await Bun.file(join(completionDir, "_talos")).text();
      const body = caseBody(talosContent, "jira:credentials:create");
      expect(body).toContain("--base-url=");
      expect(body).toContain("--email=");
      expect(body).toContain("--token=");
    });

    test("should include the token option for linear:credentials:create", async () => {
      await command.run();

      const talosContent = await Bun.file(join(completionDir, "_talos")).text();
      const body = caseBody(talosContent, "linear:credentials:create");
      expect(body).toContain("--token=");
      expect(body).not.toContain("--module=");
    });

    test("should include the token option for npm:credentials:create", async () => {
      await command.run();

      const talosContent = await Bun.file(join(completionDir, "_talos")).text();
      const body = caseBody(talosContent, "npm:credentials:create");
      expect(body).toContain("--token=");
      expect(body).not.toContain("--module=");
    });

    test("should include version and upgrade commands with their descriptions", async () => {
      await command.run();

      const talosContent = await Bun.file(join(completionDir, "_talos")).text();
      expect(talosContent).toContain("version:Print the installed CLI version");
      expect(talosContent).toContain("upgrade:Upgrade the CLI to its latest version");
    });

    test("should write completion files under the .zsh directory", async () => {
      await command.run();

      expect(existsSync(join(testHome, ".zsh", "_oo"))).toBe(true);
      expect(existsSync(join(testHome, ".zsh", "_talos"))).toBe(true);
    });
  });
});
