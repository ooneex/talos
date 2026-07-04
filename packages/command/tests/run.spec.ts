import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { container } from "@talosjs/container";
import { Exception } from "@talosjs/exception";
import { COMMANDS_CONTAINER } from "@/container";
import type { ICommand } from "@/types";

let mockParseArgsResult: { values: Record<string, unknown>; positionals: string[] } = {
  values: {},
  positionals: [],
};

const originalUtil = await import("node:util");

mock.module("node:util", () => ({
  ...originalUtil,
  parseArgs: () => mockParseArgsResult,
}));

const originalAppEnv = await import("@talosjs/app-env");
const loadEnvMock = mock(async () => {});

mock.module("@talosjs/app-env", () => ({
  ...originalAppEnv,
  loadEnv: loadEnvMock,
}));

// Import run after mocking node:util and @talosjs/app-env
const { run } = await import("@/run");

describe("run", () => {
  let initialCommandsLength: number;
  let exitMock: ReturnType<typeof spyOn>;

  beforeEach(() => {
    initialCommandsLength = COMMANDS_CONTAINER.length;
    mockParseArgsResult = { values: {}, positionals: [] };
    loadEnvMock.mockReset();
    exitMock = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    while (COMMANDS_CONTAINER.length > initialCommandsLength) {
      const cmd = COMMANDS_CONTAINER.pop();
      if (cmd) {
        container.remove(cmd);
      }
    }
    exitMock.mockRestore();
  });

  describe("Basic Functionality", () => {
    test("should be defined", () => {
      expect(run).toBeDefined();
      expect(typeof run).toBe("function");
    });

    test("calls loadEnv before executing command", async () => {
      const runFn = mock(async () => {});

      class LoadEnvTestCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "load-env-test";
        }
        public getDescription(): string {
          return "load env test";
        }
      }

      container.add(LoadEnvTestCommand);
      COMMANDS_CONTAINER.push(LoadEnvTestCommand);

      mockParseArgsResult = {
        values: {},
        positionals: ["bun", "script.ts", "load-env-test"],
      };

      await run();

      expect(loadEnvMock).toHaveBeenCalledTimes(1);
      expect(runFn).toHaveBeenCalledTimes(1);
    });

    test("should execute a registered command", async () => {
      const runFn = mock(async () => {});

      class TestRunCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "test-run";
        }
        public getDescription(): string {
          return "test run command";
        }
      }

      container.add(TestRunCommand);
      COMMANDS_CONTAINER.push(TestRunCommand);

      mockParseArgsResult = {
        values: {},
        positionals: ["bun", "script.ts", "test-run"],
      };

      await run();

      expect(runFn).toHaveBeenCalledTimes(1);
    });

    test("should pass parsed values to command.run", async () => {
      const runFn = mock(async () => {});

      class ValuesCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "values-cmd";
        }
        public getDescription(): string {
          return "values command";
        }
      }

      container.add(ValuesCommand);
      COMMANDS_CONTAINER.push(ValuesCommand);

      mockParseArgsResult = {
        values: { name: "MyName", dir: "src", module: "auth" },
        positionals: ["bun", "script.ts", "values-cmd"],
      };

      await run();

      expect(runFn).toHaveBeenCalledTimes(1);
      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].name).toBe("MyName");
      expect(args[0].dir).toBe("src");
      expect(args[0].module).toBe("auth");
    });

    test("should pass module as undefined when not provided", async () => {
      const runFn = mock(async () => {});

      class DefaultModuleCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "default-module-cmd";
        }
        public getDescription(): string {
          return "default module command";
        }
      }

      container.add(DefaultModuleCommand);
      COMMANDS_CONTAINER.push(DefaultModuleCommand);

      mockParseArgsResult = {
        values: {},
        positionals: ["bun", "script.ts", "default-module-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].module).toBeUndefined();
    });

    test("should pass module as undefined when passed as bare flag (boolean true)", async () => {
      const runFn = mock(async () => {});

      class BooleanModuleCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "boolean-module-cmd";
        }
        public getDescription(): string {
          return "boolean module command";
        }
      }

      container.add(BooleanModuleCommand);
      COMMANDS_CONTAINER.push(BooleanModuleCommand);

      mockParseArgsResult = {
        values: { module: true },
        positionals: ["bun", "script.ts", "boolean-module-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].module).toBeUndefined();
    });

    test("should convert module to kebab-case", async () => {
      const runFn = mock(async () => {});

      class ModuleKebabCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "module-kebab-cmd";
        }
        public getDescription(): string {
          return "module kebab command";
        }
      }

      container.add(ModuleKebabCommand);
      COMMANDS_CONTAINER.push(ModuleKebabCommand);

      mockParseArgsResult = {
        values: { module: "UserProfile" },
        positionals: ["bun", "script.ts", "module-kebab-cmd"],
      };

      await run();

      expect(runFn).toHaveBeenCalledTimes(1);
      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].module).toBe("user-profile");
    });

    test("should convert modules to a kebab-case comma-separated list", async () => {
      const runFn = mock(async () => {});

      class ModulesKebabCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "modules-kebab-cmd";
        }
        public getDescription(): string {
          return "modules kebab command";
        }
      }

      container.add(ModulesKebabCommand);
      COMMANDS_CONTAINER.push(ModulesKebabCommand);

      mockParseArgsResult = {
        values: { modules: "UserProfile,BillingAccount" },
        positionals: ["bun", "script.ts", "modules-kebab-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].modules).toBe("user-profile,billing-account");
    });

    test("should convert packages to a kebab-case comma-separated list", async () => {
      const runFn = mock(async () => {});

      class PackagesKebabCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "packages-kebab-cmd";
        }
        public getDescription(): string {
          return "packages kebab command";
        }
      }

      container.add(PackagesKebabCommand);
      COMMANDS_CONTAINER.push(PackagesKebabCommand);

      mockParseArgsResult = {
        values: { packages: "Cli,Command" },
        positionals: ["bun", "script.ts", "packages-kebab-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].packages).toBe("cli,command");
    });

    test("should pass modules and packages as undefined when passed as bare flags", async () => {
      const runFn = mock(async () => {});

      class BooleanPluralCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "boolean-plural-cmd";
        }
        public getDescription(): string {
          return "boolean plural command";
        }
      }

      container.add(BooleanPluralCommand);
      COMMANDS_CONTAINER.push(BooleanPluralCommand);

      mockParseArgsResult = {
        values: { modules: true, packages: true },
        positionals: ["bun", "script.ts", "boolean-plural-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].modules).toBeUndefined();
      expect(args[0].packages).toBeUndefined();
    });

    test("should pass route options correctly", async () => {
      const runFn = mock(async () => {});

      class RouteCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "route-cmd";
        }
        public getDescription(): string {
          return "route command";
        }
      }

      container.add(RouteCommand);
      COMMANDS_CONTAINER.push(RouteCommand);

      mockParseArgsResult = {
        values: {
          "route-name": "home",
          "route-path": "/home",
          "route-method": "GET",
        },
        positionals: ["bun", "script.ts", "route-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      const route = args[0].route as Record<string, unknown>;
      expect(route.name).toBe("home");
      expect(route.path).toBe("/home");
      expect(route.method).toBe("GET");
    });

    test("should transform is-socket to isSocket", async () => {
      const runFn = mock(async () => {});

      class SocketCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "socket-cmd";
        }
        public getDescription(): string {
          return "socket command";
        }
      }

      container.add(SocketCommand);
      COMMANDS_CONTAINER.push(SocketCommand);

      mockParseArgsResult = {
        values: { "is-socket": true },
        positionals: ["bun", "script.ts", "socket-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].isSocket).toBe(true);
    });

    test("should transform table-name to tableName", async () => {
      const runFn = mock(async () => {});

      class TableCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "table-cmd";
        }
        public getDescription(): string {
          return "table command";
        }
      }

      container.add(TableCommand);
      COMMANDS_CONTAINER.push(TableCommand);

      mockParseArgsResult = {
        values: { "table-name": "users" },
        positionals: ["bun", "script.ts", "table-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].tableName).toBe("users");
    });

    test("should pass version option", async () => {
      const runFn = mock(async () => {});

      class VersionCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "version-cmd";
        }
        public getDescription(): string {
          return "version command";
        }
      }

      container.add(VersionCommand);
      COMMANDS_CONTAINER.push(VersionCommand);

      mockParseArgsResult = {
        values: { version: "20240101120000" },
        positionals: ["bun", "script.ts", "version-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].version).toBe("20240101120000");
    });

    test("should pass drop option", async () => {
      const runFn = mock(async () => {});

      class DropCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "drop-cmd";
        }
        public getDescription(): string {
          return "drop command";
        }
      }

      container.add(DropCommand);
      COMMANDS_CONTAINER.push(DropCommand);

      mockParseArgsResult = {
        values: { drop: true },
        positionals: ["bun", "script.ts", "drop-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].drop).toBe(true);
    });

    test("should pass publish option", async () => {
      const runFn = mock(async () => {});

      class PublishCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "publish-cmd";
        }
        public getDescription(): string {
          return "publish command";
        }
      }

      container.add(PublishCommand);
      COMMANDS_CONTAINER.push(PublishCommand);

      mockParseArgsResult = {
        values: { publish: true },
        positionals: ["bun", "script.ts", "publish-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].publish).toBe(true);
    });

    test("should pass override option", async () => {
      const runFn = mock(async () => {});

      class OverrideCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "override-cmd";
        }
        public getDescription(): string {
          return "override command";
        }
      }

      container.add(OverrideCommand);
      COMMANDS_CONTAINER.push(OverrideCommand);

      mockParseArgsResult = {
        values: { override: true },
        positionals: ["bun", "script.ts", "override-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].override).toBe(true);
    });

    test("should pass target option", async () => {
      const runFn = mock(async () => {});

      class TargetCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "target-cmd";
        }
        public getDescription(): string {
          return "target command";
        }
      }

      container.add(TargetCommand);
      COMMANDS_CONTAINER.push(TargetCommand);

      mockParseArgsResult = {
        values: { target: "UpdateStatusController" },
        positionals: ["bun", "script.ts", "target-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].target).toBe("UpdateStatusController");
    });

    test("should pass id option", async () => {
      const runFn = mock(async () => {});

      class IdCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "id-cmd";
        }
        public getDescription(): string {
          return "id command";
        }
      }

      container.add(IdCommand);
      COMMANDS_CONTAINER.push(IdCommand);

      mockParseArgsResult = {
        values: { id: "abc-123" },
        positionals: ["bun", "script.ts", "id-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].id).toBe("abc-123");
    });

    test("should pass provider option", async () => {
      const runFn = mock(async () => {});

      class ProviderCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "provider-cmd";
        }
        public getDescription(): string {
          return "provider command";
        }
      }

      container.add(ProviderCommand);
      COMMANDS_CONTAINER.push(ProviderCommand);

      mockParseArgsResult = {
        values: { provider: "jira" },
        positionals: ["bun", "script.ts", "provider-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].provider).toBe("jira");
    });

    test("should pass title option", async () => {
      const runFn = mock(async () => {});

      class TitleCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "title-cmd";
        }
        public getDescription(): string {
          return "title command";
        }
      }

      container.add(TitleCommand);
      COMMANDS_CONTAINER.push(TitleCommand);

      mockParseArgsResult = {
        values: { title: "My Issue" },
        positionals: ["bun", "script.ts", "title-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].title).toBe("My Issue");
    });

    test("should pass description option", async () => {
      const runFn = mock(async () => {});

      class DescriptionCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "description-cmd";
        }
        public getDescription(): string {
          return "description command";
        }
      }

      container.add(DescriptionCommand);
      COMMANDS_CONTAINER.push(DescriptionCommand);

      mockParseArgsResult = {
        values: { description: "Some description" },
        positionals: ["bun", "script.ts", "description-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].description).toBe("Some description");
    });

    test("should pass interactive option", async () => {
      const runFn = mock(async () => {});

      class InteractiveCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "interactive-cmd";
        }
        public getDescription(): string {
          return "interactive command";
        }
      }

      container.add(InteractiveCommand);
      COMMANDS_CONTAINER.push(InteractiveCommand);

      mockParseArgsResult = {
        values: { interactive: true },
        positionals: ["bun", "script.ts", "interactive-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].interactive).toBe(true);
    });

    test("should pass state option", async () => {
      const runFn = mock(async () => {});

      class StateCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "state-cmd";
        }
        public getDescription(): string {
          return "state command";
        }
      }

      container.add(StateCommand);
      COMMANDS_CONTAINER.push(StateCommand);

      mockParseArgsResult = {
        values: { state: "In Progress" },
        positionals: ["bun", "script.ts", "state-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].state).toBe("In Progress");
    });

    test("should pass priority option", async () => {
      const runFn = mock(async () => {});

      class PriorityCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "priority-cmd";
        }
        public getDescription(): string {
          return "priority command";
        }
      }

      container.add(PriorityCommand);
      COMMANDS_CONTAINER.push(PriorityCommand);

      mockParseArgsResult = {
        values: { priority: "High" },
        positionals: ["bun", "script.ts", "priority-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].priority).toBe("High");
    });

    test("should pass labels option as array", async () => {
      const runFn = mock(async () => {});

      class LabelsCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "labels-cmd";
        }
        public getDescription(): string {
          return "labels command";
        }
      }

      container.add(LabelsCommand);
      COMMANDS_CONTAINER.push(LabelsCommand);

      mockParseArgsResult = {
        values: { labels: ["bug", "frontend"] },
        positionals: ["bun", "script.ts", "labels-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].labels).toEqual(["bug", "frontend"]);
    });

    test("should pass channel and destination options", async () => {
      const runFn = mock(async () => {});

      class ChannelCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "channel-cmd";
        }
        public getDescription(): string {
          return "channel command";
        }
      }

      container.add(ChannelCommand);
      COMMANDS_CONTAINER.push(ChannelCommand);

      mockParseArgsResult = {
        values: { channel: "email", destination: "output" },
        positionals: ["bun", "script.ts", "channel-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].channel).toBe("email");
      expect(args[0].destination).toBe("output");
    });
  });

  describe("Default Help Command", () => {
    test("should default to help command when no command name is provided", async () => {
      const runFn = mock(async () => {});

      class HelpCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "help";
        }
        public getDescription(): string {
          return "help command";
        }
      }

      container.add(HelpCommand);
      COMMANDS_CONTAINER.push(HelpCommand);

      mockParseArgsResult = {
        values: {},
        positionals: ["bun", "script.ts"],
      };

      await run();

      expect(runFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("Version Flag", () => {
    class VersionFlagCommand implements ICommand {
      public static runFn = mock(async () => {});
      public run = VersionFlagCommand.runFn;
      public getName(): string {
        return "version";
      }
      public getDescription(): string {
        return "print the installed CLI version";
      }
    }

    const registerVersionCommand = () => {
      VersionFlagCommand.runFn.mockReset();
      container.add(VersionFlagCommand);
      COMMANDS_CONTAINER.push(VersionFlagCommand);
    };

    test("should run the version command for -v when no command is given", async () => {
      registerVersionCommand();

      mockParseArgsResult = {
        values: { v: true },
        positionals: ["bun", "script.ts"],
      };

      await run();

      expect(VersionFlagCommand.runFn).toHaveBeenCalledTimes(1);
    });

    test("should run the version command for --version when no command is given", async () => {
      registerVersionCommand();

      mockParseArgsResult = {
        values: { version: true },
        positionals: ["bun", "script.ts"],
      };

      await run();

      expect(VersionFlagCommand.runFn).toHaveBeenCalledTimes(1);
    });

    test("should not run the version command when a command is given", async () => {
      registerVersionCommand();

      const helpFn = mock(async () => {});

      class HelpForVersionCommand implements ICommand {
        public run = helpFn;
        public getName(): string {
          return "help";
        }
        public getDescription(): string {
          return "help command";
        }
      }

      container.add(HelpForVersionCommand);
      COMMANDS_CONTAINER.push(HelpForVersionCommand);

      mockParseArgsResult = {
        values: { v: true },
        positionals: ["bun", "script.ts", "help"],
      };

      await run();

      expect(helpFn).toHaveBeenCalledTimes(1);
      expect(VersionFlagCommand.runFn).not.toHaveBeenCalled();
    });
  });

  describe("Help Flag", () => {
    class HelpFlagCommand implements ICommand {
      public static runFn = mock(async () => {});
      public run = HelpFlagCommand.runFn;
      public getName(): string {
        return "help";
      }
      public getDescription(): string {
        return "help command";
      }
    }

    const registerHelpCommand = () => {
      HelpFlagCommand.runFn.mockReset();
      container.add(HelpFlagCommand);
      COMMANDS_CONTAINER.push(HelpFlagCommand);
    };

    test("should run the help command for -h when no command is given", async () => {
      registerHelpCommand();

      mockParseArgsResult = {
        values: { h: true },
        positionals: ["bun", "script.ts"],
      };

      await run();

      expect(HelpFlagCommand.runFn).toHaveBeenCalledTimes(1);
    });

    test("should run the help command for --help when no command is given", async () => {
      registerHelpCommand();

      mockParseArgsResult = {
        values: { help: true },
        positionals: ["bun", "script.ts"],
      };

      await run();

      expect(HelpFlagCommand.runFn).toHaveBeenCalledTimes(1);
    });

    test("should prefer the version command when both -v and -h are given", async () => {
      registerHelpCommand();

      const versionFn = mock(async () => {});

      class VersionForHelpCommand implements ICommand {
        public run = versionFn;
        public getName(): string {
          return "version";
        }
        public getDescription(): string {
          return "version command";
        }
      }

      container.add(VersionForHelpCommand);
      COMMANDS_CONTAINER.push(VersionForHelpCommand);

      mockParseArgsResult = {
        values: { v: true, h: true },
        positionals: ["bun", "script.ts"],
      };

      await run();

      expect(versionFn).toHaveBeenCalledTimes(1);
      expect(HelpFlagCommand.runFn).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    test("should exit with code 1 when command is not found", async () => {
      mockParseArgsResult = {
        values: {},
        positionals: ["bun", "script.ts", "nonexistent-command"],
      };

      expect(run()).rejects.toThrow("process.exit called");
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    test("should exit with code 1 when command.run throws an Error", async () => {
      class FailingCommand implements ICommand {
        public run(): void {
          throw new Error("command failed");
        }
        public getName(): string {
          return "failing-cmd";
        }
        public getDescription(): string {
          return "failing command";
        }
      }

      container.add(FailingCommand);
      COMMANDS_CONTAINER.push(FailingCommand);

      mockParseArgsResult = {
        values: {},
        positionals: ["bun", "script.ts", "failing-cmd"],
      };

      expect(run()).rejects.toThrow("process.exit called");
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    test("should exit with code 1 when command.run throws an Exception", async () => {
      class ExceptionCommand implements ICommand {
        public run(): void {
          throw new Exception("talos exception");
        }
        public getName(): string {
          return "exception-cmd";
        }
        public getDescription(): string {
          return "exception command";
        }
      }

      container.add(ExceptionCommand);
      COMMANDS_CONTAINER.push(ExceptionCommand);

      mockParseArgsResult = {
        values: {},
        positionals: ["bun", "script.ts", "exception-cmd"],
      };

      expect(run()).rejects.toThrow("process.exit called");
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    test("should exit with code 1 when command.run throws a string", async () => {
      class StringThrowCommand implements ICommand {
        public run(): void {
          throw "string error";
        }
        public getName(): string {
          return "string-throw-cmd";
        }
        public getDescription(): string {
          return "string throw command";
        }
      }

      container.add(StringThrowCommand);
      COMMANDS_CONTAINER.push(StringThrowCommand);

      mockParseArgsResult = {
        values: {},
        positionals: ["bun", "script.ts", "string-throw-cmd"],
      };

      expect(run()).rejects.toThrow("process.exit called");
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    test("should exit with code 1 when async command.run rejects", async () => {
      class RejectingCommand implements ICommand {
        public async run(): Promise<void> {
          throw new Error("async rejection");
        }
        public getName(): string {
          return "rejecting-cmd";
        }
        public getDescription(): string {
          return "rejecting command";
        }
      }

      container.add(RejectingCommand);
      COMMANDS_CONTAINER.push(RejectingCommand);

      mockParseArgsResult = {
        values: {},
        positionals: ["bun", "script.ts", "rejecting-cmd"],
      };

      expect(run()).rejects.toThrow("process.exit called");
      expect(exitMock).toHaveBeenCalledWith(1);
    });
  });

  describe("Undefined Options", () => {
    test("should pass undefined for options not provided", async () => {
      const runFn = mock(async () => {});

      class MinimalCommand implements ICommand {
        public run = runFn;
        public getName(): string {
          return "minimal-cmd";
        }
        public getDescription(): string {
          return "minimal command";
        }
      }

      container.add(MinimalCommand);
      COMMANDS_CONTAINER.push(MinimalCommand);

      mockParseArgsResult = {
        values: {},
        positionals: ["bun", "script.ts", "minimal-cmd"],
      };

      await run();

      const args = runFn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].name).toBeUndefined();
      expect(args[0].dir).toBeUndefined();
      expect(args[0].channel).toBeUndefined();
      expect(args[0].isSocket).toBeUndefined();
      expect(args[0].tableName).toBeUndefined();
      expect(args[0].version).toBeUndefined();
      expect(args[0].module).toBeUndefined();
      expect(args[0].modules).toBeUndefined();
      expect(args[0].packages).toBeUndefined();
      expect(args[0].destination).toBeUndefined();
      expect(args[0].drop).toBeUndefined();
      expect(args[0].publish).toBeUndefined();
      expect(args[0].override).toBeUndefined();
      expect(args[0].target).toBeUndefined();
      expect(args[0].id).toBeUndefined();
      expect(args[0].provider).toBeUndefined();
      expect(args[0].title).toBeUndefined();
      expect(args[0].state).toBeUndefined();
      expect(args[0].priority).toBeUndefined();
      expect(args[0].description).toBeUndefined();
      expect(args[0].labels).toBeUndefined();
      expect(args[0].interactive).toBeUndefined();

      const route = args[0].route as Record<string, unknown>;
      expect(route.name).toBeUndefined();
      expect(route.path).toBeUndefined();
      expect(route.method).toBeUndefined();
    });
  });
});
