import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");
const templatePath = join(templatesDir, "completions/talos.bash.txt");

const read = () => Bun.file(templatePath).text();

// Extract the body of a `case` branch: everything between `pattern)` and the
// closing `;;`.
const caseBody = (content: string, pattern: string): string => {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`\\n\\s*${escaped}\\)\\s*\\n([\\s\\S]*?)\\n\\s*;;`));
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
};

describe("talos.bash.txt", () => {
  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should register the completion for oo and talos", async () => {
    const content = await read();
    expect(content).toContain("_talos()");
    expect(content).toContain("complete -F _talos oo talos");
  });

  describe("dynamic candidate helpers", () => {
    const helpers = [
      "_talos_modules()",
      "_talos_packages()",
      "_talos_pkg_modules()",
      "_talos_docker_packages()",
      "_talos_docker_modules()",
      "_talos_yaml_modules()",
      "_talos_destination_modules()",
      "_talos_sdk_modules()",
      "_talos_custom_commands()",
      "_talos_run_commands()",
    ];

    test.each(helpers)("should define %s", async (helper) => {
      const content = await read();
      expect(content).toContain(helper);
    });

    test("modules helper should list the modules directory", async () => {
      const content = await read();
      expect(content).toContain("command ls -1 modules");
    });

    test("custom commands helper should extract names from getName", async () => {
      const content = await read();
      expect(content).toContain("modules/*/src/commands/*Command.ts");
      expect(content).toContain('s/.*return "\\(.*\\)".*/\\1/p');
    });
  });

  describe("colon / equals handling", () => {
    test("should reassemble colon and equals word-break tokens", async () => {
      const content = await read();
      expect(content).toContain("_talos_reassemble_words");
    });

    test("should trim the colon prefix from candidates", async () => {
      const content = await read();
      expect(content).toContain("_talos_ltrim_colon");
      expect(content).toContain("COMP_WORDBREAKS");
    });

    test("should split --flag=value tokens for value completion", async () => {
      const content = await read();
      expect(content).toContain("cur%%=*");
      expect(content).toContain("cur#*=");
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
      "run",
      "sdk:create",
      "seed:run",
      "service:create",
    ];

    test.each(expectedCommands)("should include the %s command", async (cmd) => {
      const content = await read();
      // The command list is declared in the `commands` variable.
      const commandsBlock = content.match(/local commands="([\s\S]*?)"/);
      expect(commandsBlock).not.toBeNull();
      expect(commandsBlock?.[1]).toContain(cmd);
    });
  });

  describe("per-command options", () => {
    test("no-argument commands should have an empty branch", async () => {
      const content = await read();
      expect(content).toContain("completion:zsh | completion:bash | completion:fish | help | version | upgrade) ;;");
    });

    test("controller:create should offer its options and HTTP methods", async () => {
      const body = caseBody(await read(), "controller:create");
      expect(body).toContain('opts="--name --module --route-name --route-path --route-method --is-socket --override"');
      expect(body).toContain("_talos_modules");
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
        expect(body).toContain(method);
      }
    });

    test("docker:create should offer service names but no module option", async () => {
      const body = caseBody(await read(), "docker:create");
      expect(body).toContain("postgres");
      expect(body).toContain("redis");
      expect(body).not.toContain("_talos_modules");
    });

    test("command:run should suggest custom command names", async () => {
      const body = caseBody(await read(), "command:run");
      expect(body).toContain("_talos_custom_commands");
    });

    test("module:create should suggest destination modules for --destination", async () => {
      const body = caseBody(await read(), "module:create");
      expect(body).toContain("--name --destination");
      expect(body).toContain("_talos_destination_modules");
    });

    test("npm:publish should suggest packages, modules, and access levels", async () => {
      const body = caseBody(await read(), "npm:publish");
      expect(body).toContain("_talos_packages");
      expect(body).toContain("_talos_pkg_modules");
      expect(body).toContain("public restricted");
    });

    test("issue:create should suggest state and priority choices", async () => {
      const body = caseBody(await read(), "issue:create");
      expect(body).toContain("Backlog Todo Planned Done Cancelled");
      expect(body).toContain("Low Medium High Urgent");
    });
  });
});
