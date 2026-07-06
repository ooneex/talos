import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");
const templatePath = join(templatesDir, "completions/_talos.txt");

describe("_talos.txt", () => {
  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should start with compdef directive", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toStartWith("#compdef oo talos");
  });

  test("should define _talos function", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("_talos()");
    expect(content).toContain('_talos "$@"');
  });

  describe("modules helper", () => {
    test("should define _talos_modules function", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_modules()");
    });

    test("should list directories from modules folder", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("command ls -1 modules");
      expect(content).toContain("compadd -a modules");
    });

    test("should check if modules directory exists", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("[[ -d modules ]]");
    });
  });

  describe("custom commands helper", () => {
    test("should define _talos_custom_commands function", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_custom_commands()");
    });

    test("should grep command names from module command files", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("modules/*/src/commands/*Command.ts");
      expect(content).toContain("compadd -a cmds");
    });

    test("should only extract names from getName method", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("grep -rh -A1 'getName'");
      expect(content).not.toContain("grep -rh 'return \"'");
    });
  });

  describe("design modules helper", () => {
    test("should define _talos_design_modules function", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_design_modules()");
    });

    test("should list only modules whose yml declares the design type", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("grep -rl 'type: \"design\"' modules/*/*.yml");
      expect(content).toContain("compadd -a designs");
    });
  });

  describe("destination modules helper", () => {
    test("should define _talos_destination_modules function", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_destination_modules()");
    });

    test("should list only modules whose yml declares the api or microservice type", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("grep -rlE 'type: \"(api|microservice)\"' modules/*/*.yml");
      expect(content).toContain("compadd -a destinations");
    });
  });

  describe("sdk modules helper", () => {
    test("should define _talos_sdk_modules function", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_sdk_modules()");
    });

    test("should list the app plus modules whose yml declares the microservice type", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("targets=(app ");
      expect(content).toContain("grep -rl 'type: \"microservice\"' modules/*/*.yml");
      expect(content).toContain("compadd -a targets");
    });
  });

  describe("sdk names helper", () => {
    test("should define _talos_sdk_names function", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_sdk_names()");
    });

    test("should list only modules whose yml declares the sdk type", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("grep -rl 'type: \"sdk\"' modules/*/*.yml");
      expect(content).toContain("compadd -a names");
    });
  });

  describe("runnable type module helpers", () => {
    test("should define _talos_api_modules listing api modules as a comma-separated value", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_api_modules()");
      expect(content).toContain("grep -rl 'type: \"api\"' modules/*/*.yml");
      expect(content).toContain("_values -s , 'api modules'");
    });

    test("should define _talos_microservice_modules listing microservice modules as a comma-separated value", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_microservice_modules()");
      expect(content).toContain("grep -rl 'type: \"microservice\"' modules/*/*.yml");
      expect(content).toContain("_values -s , 'microservice modules'");
    });

    test("should define _talos_spa_modules listing spa modules as a comma-separated value", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_spa_modules()");
      expect(content).toContain("grep -rl 'type: \"spa\"' modules/*/*.yml");
      expect(content).toContain("_values -s , 'spa modules'");
    });
  });

  describe("publish target helpers", () => {
    test("should define _talos_publish_packages listing packages with a package.json as a comma-separated value", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_publish_packages()");
      expect(content).toContain("packages=(packages/*/package.json(N))");
      expect(content).toContain("_values -s , 'packages'");
    });

    test("should define _talos_publish_modules listing modules with a package.json as a comma-separated value", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_publish_modules()");
      expect(content).toContain("modules=(modules/*/package.json(N))");
      expect(content).toContain("_values -s , 'modules'");
    });
  });

  describe("docker publish target helpers", () => {
    test("should define _talos_docker_publish_packages listing packages with a Dockerfile as a comma-separated value", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_docker_publish_packages()");
      expect(content).toContain("packages=(packages/*/Dockerfile(N))");
      expect(content).toContain("_values -s , 'packages'");
    });

    test("should define _talos_docker_publish_modules listing modules with a Dockerfile as a comma-separated value", async () => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain("_talos_docker_publish_modules()");
      expect(content).toContain("modules=(modules/*/Dockerfile(N))");
      expect(content).toContain("_values -s , 'modules'");
    });
  });

  describe("commands list", () => {
    const expectedCommands = [
      "app\\:init",
      "app\\:start",
      "app\\:stop",
      "command\\:run",
      "completion\\:zsh",
      "completion\\:bash",
      "completion\\:fish",
      "help",
      "version",
      "upgrade",
      "ai\\:chat\\:create",
      "ai\\:tool\\:create",
      "ai\\:middleware\\:create",
      "analytics\\:create",
      "app\\:create",
      "agent\\:skills\\:create",
      "cache\\:create",
      "command\\:create",
      "controller\\:create",
      "cron\\:create",
      "database\\:create",
      "design\\:create",
      "design\\:remove",
      "docker\\:create",
      "entity\\:create",
      "event\\:create",
      "flag\\:create",
      "logger\\:create",
      "mailer\\:create",
      "microservice\\:create",
      "microservice\\:remove",
      "middleware\\:create",
      "migration\\:create",
      "migration\\:up",
      "migration\\:down",
      "module\\:create",
      "module\\:remove",
      "permission\\:create",
      "queue\\:create",
      "rate-limit\\:create",
      "release\\:create",
      "repository\\:create",
      "sdk\\:create",
      "spa\\:feature\\:create",
      "spa\\:remove",
      "issue\\:create",
      "issue\\:pull",
      "issue\\:push",
      "seed\\:create",
      "seed\\:run",
      "service\\:create",
      "storage\\:create",
      "vector-database\\:create",
      "workflow\\:create",
      "workflow\\:transition\\:create",
    ];

    test.each(expectedCommands)("should include %s command", async (cmd) => {
      const content = await Bun.file(templatePath).text();
      expect(content).toContain(cmd);
    });
  });

  describe("command options", () => {
    test("command:run should suggest custom command names", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/command:run\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("_talos_custom_commands");
    });

    test("controller:create should have name, module, route-name, route-path, route-method, is-socket, and override options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/controller:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).toContain("--module=");
      expect(match?.[1]).toContain("_talos_modules");
      expect(match?.[1]).toContain("--route-name=");
      expect(match?.[1]).toContain("--route-path=");
      expect(match?.[1]).toContain("--route-method=");
      expect(match?.[1]).toContain("--is-socket");
      expect(match?.[1]).toContain("--override");
    });

    test("middleware:create should have name, module, is-socket, and override options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/middleware:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).toContain("--module=");
      expect(match?.[1]).toContain("_talos_modules");
      expect(match?.[1]).toContain("--is-socket");
      expect(match?.[1]).toContain("--override");
    });

    test("entity:create should have name, module, table-name, and override options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/entity:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).toContain("--module=");
      expect(match?.[1]).toContain("_talos_modules");
      expect(match?.[1]).toContain("--table-name=");
      expect(match?.[1]).toContain("--override");
    });

    test("event:create should have name, module, channel, and override options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/event:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).toContain("--module=");
      expect(match?.[1]).toContain("_talos_modules");
      expect(match?.[1]).toContain("--channel=");
      expect(match?.[1]).toContain("--override");
    });

    test("migration:create should have module option", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/migration:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--module=");
      expect(match?.[1]).toContain("_talos_modules");
    });

    test("release:create should have packages and modules options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/release:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--packages=");
      expect(match?.[1]).toContain("_talos_publish_packages");
      expect(match?.[1]).toContain("--modules=");
      expect(match?.[1]).toContain("_talos_publish_modules");
    });

    test("seed:create should have name and module options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/seed:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).toContain("--module=");
      expect(match?.[1]).toContain("_talos_modules");
    });

    test("issue:create should have title, state, priority, description, labels, module, and interactive options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/issue:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--title=");
      expect(match?.[1]).toContain("--state=");
      expect(match?.[1]).toContain("--priority=");
      expect(match?.[1]).toContain("--description=");
      expect(match?.[1]).toContain("--labels=");
      expect(match?.[1]).toContain("--module=");
      expect(match?.[1]).toContain("_talos_modules");
      expect(match?.[1]).toContain("--interactive");
      expect(match?.[1]).not.toContain("--id=");
    });

    test("issue:create should suggest state choices", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/issue:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      for (const state of ["Backlog", "Todo", "Done", "Cancelled"]) {
        expect(match?.[1]).toContain(state);
      }
    });

    test("issue:create should suggest priority choices", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/issue:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      for (const priority of ["Low", "Medium", "High", "Urgent"]) {
        expect(match?.[1]).toContain(priority);
      }
    });

    test("issue:pull should have id and module options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/issue:pull\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--id=");
      expect(match?.[1]).toContain("--module=");
      expect(match?.[1]).toContain("_talos_modules");
    });

    test("issue:push should have id and module options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/issue:push\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--id=");
      expect(match?.[1]).toContain("--module=");
      expect(match?.[1]).toContain("_talos_modules");
    });

    test("docker:create should have name with predefined services but no module option", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/docker:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).not.toContain("--module=");
      expect(match?.[1]).not.toContain("_talos_modules");
      expect(match?.[1]).toContain("postgres");
      expect(match?.[1]).toContain("redis");
      expect(match?.[1]).not.toContain("talos-jade");
    });

    test("controller:create should include all HTTP methods", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/controller:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
        expect(match?.[1]).toContain(method);
      }
    });

    describe("grouped commands with name and module options", () => {
      const groupedCommands = [
        "ai:chat:create",
        "ai:tool:create",
        "ai:middleware:create",
        "analytics:create",
        "cache:create",
        "command:create",
        "cron:create",
        "database:create",
        "flag:create",
        "logger:create",
        "mailer:create",
        "permission:create",
        "queue:create",
        "rate-limit:create",
        "repository:create",
        "service:create",
        "spa:feature:create",
        "storage:create",
        "translation:create",
        "vector-database:create",
        "workflow:create",
        "workflow:transition:create",
      ];

      test("should have name, module, and override options", async () => {
        const content = await Bun.file(templatePath).text();
        const pattern = groupedCommands.map((c) => c.replaceAll(":", "\\:")).join("|");
        const regex = new RegExp(`(${pattern})\\)(.*?);;`, "s");
        const match = content.match(regex);
        expect(match).not.toBeNull();
        expect(match?.[2]).toContain("--name=");
        expect(match?.[2]).toContain("--module=");
        expect(match?.[2]).toContain("_talos_modules");
        expect(match?.[2]).toContain("--override");
      });
    });
  });

  describe("excluded commands should not have --module option", () => {
    test("module:create should have --name and --destination with destination module suggestions", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/module:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).toContain("--destination=");
      expect(match?.[1]).toContain("_talos_destination_modules");
      expect(match?.[1]).not.toContain("--module=");
    });

    test("design:create and microservice:create should only have --name", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/design:create\|microservice:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).not.toContain("--module=");
    });

    test("spa:create should have --name and --design with design module suggestions", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/spa:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).toContain("--design=");
      expect(match?.[1]).toContain("_talos_design_modules");
      expect(match?.[1]).not.toContain("--module=");
    });

    test("module:remove should have --name with module suggestions", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/module:remove\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).toContain("_talos_modules");
    });

    test("design:remove, spa:remove, microservice:remove, and module:remove should have --name with module suggestions", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/design:remove\|spa:remove\|microservice:remove\|module:remove\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).toContain("_talos_modules");
    });

    test("app:create should only have --name", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/app:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).not.toContain("--module=");
    });

    test("app:init should have --name, --destination, and --app-type options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/app:init\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).toContain("--destination=");
      expect(match?.[1]).toContain("--app-type=");
      expect(match?.[1]).toContain("cli");
      expect(match?.[1]).toContain("api");
      expect(match?.[1]).not.toContain("--module=");
    });

    test("migration:up should have --drop and --no-cache options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/migration:up\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--drop");
      expect(match?.[1]).toContain("--no-cache");
    });

    test("seed:run should have --drop option", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/seed:run\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--drop");
    });

    test("migration:down should have --version option", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/migration:down\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--version=");
    });

    test("completion commands, version, and upgrade should have no options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/completion:zsh\|completion:bash\|completion:fish\|help\|version\|upgrade\)\s*;;/);
      expect(match).not.toBeNull();
    });

    test("agent:skills:create should have --agents and --cwd options", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/agent:skills:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--agents=");
      expect(match?.[1]).toContain("_talos_agent_dirs");
      expect(match?.[1]).toContain("--cwd=");
    });

    test("app:start and app:stop should have --api, --microservice, and --spa options with module suggestions", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/app:start\|app:stop\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--api=");
      expect(match?.[1]).toContain("_talos_api_modules");
      expect(match?.[1]).toContain("--microservice=");
      expect(match?.[1]).toContain("_talos_microservice_modules");
      expect(match?.[1]).toContain("--spa=");
      expect(match?.[1]).toContain("_talos_spa_modules");
    });

    test("npm:publish should have packages, modules, and access options with publish target suggestions", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/npm:publish\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--packages=");
      expect(match?.[1]).toContain("_talos_publish_packages");
      expect(match?.[1]).toContain("--modules=");
      expect(match?.[1]).toContain("_talos_publish_modules");
      expect(match?.[1]).toContain("--access=");
      expect(match?.[1]).toContain("public");
      expect(match?.[1]).toContain("restricted");
    });

    test("docker:publish should have packages, modules, and tag options with Dockerfile target suggestions", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/docker:publish\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--packages=");
      expect(match?.[1]).toContain("_talos_docker_publish_packages");
      expect(match?.[1]).toContain("--modules=");
      expect(match?.[1]).toContain("_talos_docker_publish_modules");
      expect(match?.[1]).toContain("--tag=");
    });

    test("sdk:create should have name and module options with sdk name and target suggestions", async () => {
      const content = await Bun.file(templatePath).text();
      const match = content.match(/sdk:create\)([\s\S]*?);;/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain("--name=");
      expect(match?.[1]).toContain("--module=");
      expect(match?.[1]).toContain("_talos_sdk_names");
      expect(match?.[1]).toContain("_talos_sdk_modules");
    });
  });
});
