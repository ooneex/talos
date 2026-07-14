import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");
const templatePath = join(templatesDir, "completions/talos.fish.txt");

const read = () => Bun.file(templatePath).text();

// Collect all `complete` lines whose condition references the given subcommand
// as a whole word (so "app:start" does not match "app:start:foo").
const optionLines = (content: string, cmd: string): string => {
  const escaped = cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = new RegExp(`__fish_seen_subcommand_from[^']*(?<![\\w:-])${escaped}(?![\\w:-])`);
  return content
    .split("\n")
    .filter((line) => boundary.test(line))
    .join("\n");
};

describe("talos.fish.txt", () => {
  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should register completions for oo and talos", async () => {
    const content = await read();
    expect(content).toContain("for cmd in oo talos");
    expect(content).toContain("complete -c $cmd");
  });

  test("should gate subcommands on __fish_use_subcommand", async () => {
    const content = await read();
    expect(content).toContain("-n __fish_use_subcommand -a app:create");
  });

  describe("dynamic candidate helpers", () => {
    const helpers = [
      "function __talos_modules",
      "function __talos_packages",
      "function __talos_pkg_modules",
      "function __talos_docker_packages",
      "function __talos_docker_modules",
      "function __talos_yaml_modules",
      "function __talos_destination_modules",
      "function __talos_sdk_modules",
      "function __talos_custom_commands",
      "function __talos_run_commands",
      "function __talos_agent_dirs",
    ];

    test.each(helpers)("should define %s", async (helper) => {
      const content = await read();
      expect(content).toContain(helper);
    });

    test("glob-based helpers should collect files via set to tolerate empty globs", async () => {
      const content = await read();
      // A bare glob passed to grep errors in fish when nothing matches.
      expect(content).toContain("set -l files modules/*/*.yml");
      expect(content).toContain("set -l files modules/*/src/commands/*Command.ts");
      expect(content).not.toContain("grep -rl");
    });
  });

  describe("commands list", () => {
    const expectedCommands = [
      "app:create",
      "app:init",
      "command:run",
      "completion:zsh",
      "completion:bash",
      "completion:fish",
      "controller:create",
      "docker:create",
      "module:create",
      "monorepo:run",
      "sdk:create",
      "seed:run",
      "service:create",
    ];

    test.each(expectedCommands)("should offer the %s subcommand", async (cmd) => {
      const content = await read();
      expect(content).toContain(`-n __fish_use_subcommand -a ${cmd} `);
    });
  });

  describe("per-command options", () => {
    test("no-argument commands should suppress file completion", async () => {
      const content = await read();
      expect(content).toContain(
        "-f -n '__fish_seen_subcommand_from completion:zsh completion:bash completion:fish help version upgrade'",
      );
    });

    test("controller:create should offer its options and HTTP methods", async () => {
      const lines = optionLines(await read(), "controller:create");
      expect(lines).toContain("-l route-name");
      expect(lines).toContain("-l route-path");
      expect(lines).toContain("-l route-method");
      expect(lines).toContain("-l is-socket");
      expect(lines).toContain("GET POST PUT PATCH DELETE HEAD OPTIONS");
      expect(lines).toContain("__talos_modules");
    });

    test("docker:create should offer service names", async () => {
      const lines = optionLines(await read(), "docker:create");
      expect(lines).toContain("postgres");
      expect(lines).toContain("redis");
    });

    test("command:run should suggest custom command names", async () => {
      const lines = optionLines(await read(), "command:run");
      expect(lines).toContain("__talos_custom_commands");
    });

    test("module:create should suggest destination modules", async () => {
      const lines = optionLines(await read(), "module:create");
      expect(lines).toContain("-l destination");
      expect(lines).toContain("__talos_destination_modules");
    });

    test("npm:publish should suggest packages, modules, and access levels", async () => {
      const lines = optionLines(await read(), "npm:publish");
      expect(lines).toContain("__talos_packages");
      expect(lines).toContain("__talos_pkg_modules");
      expect(lines).toContain("public restricted");
    });

    test("issue:create should suggest priority choices and omit state", async () => {
      const lines = optionLines(await read(), "issue:create");
      expect(lines).toContain("Low Medium High Urgent");
      expect(lines).not.toContain("-l state");
    });

    test("agent:skills:create should complete agent directories", async () => {
      const lines = optionLines(await read(), "agent:skills:create");
      expect(lines).toContain("-l agents");
      expect(lines).toContain("__talos_agent_dirs");
    });
  });
});
