import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { container, EContainerScope } from "@talosjs/container";
import { COMMANDS_CONTAINER } from "@/container";
import { getCommand } from "@/getCommand";
import type { ICommand } from "@/types";

describe("getCommand", () => {
  let initialCommandsLength: number;

  beforeEach(() => {
    initialCommandsLength = COMMANDS_CONTAINER.length;
  });

  afterEach(() => {
    while (COMMANDS_CONTAINER.length > initialCommandsLength) {
      COMMANDS_CONTAINER.pop();
    }
  });

  describe("Basic Functionality", () => {
    test("should be defined", () => {
      expect(getCommand).toBeDefined();
      expect(typeof getCommand).toBe("function");
    });

    test("should accept a string name parameter", () => {
      expect(() => getCommand("test")).not.toThrow();
    });

    test("should return null when no commands are registered", () => {
      while (COMMANDS_CONTAINER.length > 0) {
        COMMANDS_CONTAINER.pop();
      }

      const result = getCommand("nonexistent");
      expect(result).toBeNull();

      // Restore initial length
      while (COMMANDS_CONTAINER.length < initialCommandsLength) {
        COMMANDS_CONTAINER.length = initialCommandsLength;
      }
    });

    test("should return null when command is not found and container is empty", () => {
      const startLength = COMMANDS_CONTAINER.length;

      // Temporarily empty the container
      const backup = COMMANDS_CONTAINER.splice(0);

      const result = getCommand("nonexistent");
      expect(result).toBeNull();

      // Restore container
      COMMANDS_CONTAINER.push(...backup);
      expect(COMMANDS_CONTAINER.length).toBe(startLength);
    });

    test("should return command instance when found", () => {
      class FindableCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "findable";
        }
        public getDescription(): string {
          return "findable command";
        }
      }

      container.add(FindableCommand);
      COMMANDS_CONTAINER.push(FindableCommand);

      const result = getCommand("findable");

      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(FindableCommand);
      expect(result?.getName()).toBe("findable");

      COMMANDS_CONTAINER.pop();
      container.remove(FindableCommand);
    });
  });

  describe("Command Retrieval", () => {
    test("should retrieve command by exact name match", () => {
      class ExactMatchCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "exact-match";
        }
        public getDescription(): string {
          return "exact match command";
        }
      }

      container.add(ExactMatchCommand);
      COMMANDS_CONTAINER.push(ExactMatchCommand);

      const result = getCommand("exact-match");

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe("exact-match");

      COMMANDS_CONTAINER.pop();
      container.remove(ExactMatchCommand);
    });

    test("should be case-sensitive when matching command names", () => {
      class CaseSensitiveCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "CaseSensitive";
        }
        public getDescription(): string {
          return "case sensitive command";
        }
      }

      container.add(CaseSensitiveCommand);
      COMMANDS_CONTAINER.push(CaseSensitiveCommand);

      const result1 = getCommand("CaseSensitive");
      expect(result1).not.toBeNull();
      expect(result1?.getName()).toBe("CaseSensitive");

      COMMANDS_CONTAINER.pop();
      container.remove(CaseSensitiveCommand);
    });

    test("should return first matching command when multiple have same name", () => {
      class FirstCommand implements ICommand {
        public identifier = "first";
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "duplicate";
        }
        public getDescription(): string {
          return "first command";
        }
      }

      class SecondCommand implements ICommand {
        public identifier = "second";
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "duplicate";
        }
        public getDescription(): string {
          return "second command";
        }
      }

      container.add(FirstCommand);
      container.add(SecondCommand);
      COMMANDS_CONTAINER.push(FirstCommand, SecondCommand);

      const result = getCommand("duplicate");

      expect(result).not.toBeNull();
      expect((result as FirstCommand).identifier).toBe("first");

      COMMANDS_CONTAINER.pop();
      COMMANDS_CONTAINER.pop();
      container.remove(FirstCommand);
      container.remove(SecondCommand);
    });

    test("should retrieve command from container using get method", () => {
      class ContainerCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "container-test";
        }
        public getDescription(): string {
          return "container test command";
        }
      }

      container.add(ContainerCommand, EContainerScope.Singleton);
      COMMANDS_CONTAINER.push(ContainerCommand);

      const result1 = getCommand("container-test");
      const result2 = getCommand("container-test");

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1).toBe(result2);

      COMMANDS_CONTAINER.pop();
      container.remove(ContainerCommand);
    });
  });

  describe("Multiple Commands", () => {
    test("should search through multiple commands to find match", () => {
      class Command1 implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "command1";
        }
        public getDescription(): string {
          return "first command";
        }
      }

      class Command2 implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "command2";
        }
        public getDescription(): string {
          return "second command";
        }
      }

      class Command3 implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "command3";
        }
        public getDescription(): string {
          return "third command";
        }
      }

      container.add(Command1);
      container.add(Command2);
      container.add(Command3);
      COMMANDS_CONTAINER.push(Command1, Command2, Command3);

      const result1 = getCommand("command1");
      const result2 = getCommand("command2");
      const result3 = getCommand("command3");

      expect(result1).toBeInstanceOf(Command1);
      expect(result2).toBeInstanceOf(Command2);
      expect(result3).toBeInstanceOf(Command3);

      COMMANDS_CONTAINER.pop();
      COMMANDS_CONTAINER.pop();
      COMMANDS_CONTAINER.pop();
      container.remove(Command1);
      container.remove(Command2);
      container.remove(Command3);
    });

    test("should stop searching after finding first match", () => {
      let getNameCallCount = 0;

      class EarlyMatchCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          getNameCallCount++;
          return "target";
        }
        public getDescription(): string {
          return "early match command";
        }
      }

      class LateCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          getNameCallCount++;
          return "other";
        }
        public getDescription(): string {
          return "late command";
        }
      }

      container.add(EarlyMatchCommand);
      container.add(LateCommand);
      COMMANDS_CONTAINER.push(EarlyMatchCommand, LateCommand);

      getNameCallCount = 0;
      const result = getCommand("target");

      expect(result).toBeInstanceOf(EarlyMatchCommand);
      expect(getNameCallCount).toBe(1);

      COMMANDS_CONTAINER.pop();
      COMMANDS_CONTAINER.pop();
      container.remove(EarlyMatchCommand);
      container.remove(LateCommand);
    });
  });

  describe("Command with Different Scopes", () => {
    test("should work with Singleton scoped commands", () => {
      class SingletonCommand implements ICommand {
        public static instanceCount = 0;
        public readonly instanceId: number;

        constructor() {
          SingletonCommand.instanceCount++;
          this.instanceId = SingletonCommand.instanceCount;
        }

        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "singleton";
        }
        public getDescription(): string {
          return "singleton command";
        }
      }

      container.add(SingletonCommand, EContainerScope.Singleton);
      COMMANDS_CONTAINER.push(SingletonCommand);

      const result1 = getCommand("singleton");
      const result2 = getCommand("singleton");

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1).toBe(result2);

      COMMANDS_CONTAINER.pop();
      container.remove(SingletonCommand);
    });

    test("should work with Transient scoped commands", () => {
      class TransientCommand implements ICommand {
        public static instanceCount = 0;
        public readonly instanceId: number;

        constructor() {
          TransientCommand.instanceCount++;
          this.instanceId = TransientCommand.instanceCount;
        }

        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "transient";
        }
        public getDescription(): string {
          return "transient command";
        }
      }

      container.add(TransientCommand, EContainerScope.Transient);
      COMMANDS_CONTAINER.push(TransientCommand);

      const result1 = getCommand("transient");
      const result2 = getCommand("transient");

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1).not.toBe(result2);
      expect((result1 as TransientCommand).instanceId).not.toBe((result2 as TransientCommand).instanceId);

      COMMANDS_CONTAINER.pop();
      container.remove(TransientCommand);
    });

    test("should work with Request scoped commands", () => {
      class RequestCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "request";
        }
        public getDescription(): string {
          return "request command";
        }
      }

      container.add(RequestCommand, EContainerScope.Request);
      COMMANDS_CONTAINER.push(RequestCommand);

      const result = getCommand("request");

      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(RequestCommand);

      COMMANDS_CONTAINER.pop();
      container.remove(RequestCommand);
    });
  });

  describe("Commands with Dependencies", () => {
    test("should retrieve command without dependencies", () => {
      class SimpleCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}

        public getName(): string {
          return "simple";
        }

        public getDescription(): string {
          return "simple command without dependencies";
        }
      }

      container.add(SimpleCommand);
      COMMANDS_CONTAINER.push(SimpleCommand);

      const result = getCommand("simple");

      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(SimpleCommand);

      COMMANDS_CONTAINER.pop();
      container.remove(SimpleCommand);
    });

    test("should handle command retrieval when multiple commands exist", () => {
      class ServiceCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}

        public getName(): string {
          return "service";
        }

        public getDescription(): string {
          return "service command";
        }
      }

      class UtilCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}

        public getName(): string {
          return "util";
        }

        public getDescription(): string {
          return "util command";
        }
      }

      container.add(ServiceCommand);
      container.add(UtilCommand);
      COMMANDS_CONTAINER.push(ServiceCommand, UtilCommand);

      const result1 = getCommand("service");
      const result2 = getCommand("util");

      expect(result1).not.toBeNull();
      expect(result1).toBeInstanceOf(ServiceCommand);
      expect(result2).not.toBeNull();
      expect(result2).toBeInstanceOf(UtilCommand);

      COMMANDS_CONTAINER.pop();
      COMMANDS_CONTAINER.pop();
      container.remove(ServiceCommand);
      container.remove(UtilCommand);
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty string name", () => {
      class EmptyNameCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "";
        }
        public getDescription(): string {
          return "empty name command";
        }
      }

      container.add(EmptyNameCommand);
      COMMANDS_CONTAINER.push(EmptyNameCommand);

      const result = getCommand("");

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe("");

      COMMANDS_CONTAINER.pop();
    });

    test("should handle whitespace in command names", () => {
      class WhitespaceCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "command with spaces";
        }
        public getDescription(): string {
          return "whitespace command";
        }
      }

      container.add(WhitespaceCommand);
      COMMANDS_CONTAINER.push(WhitespaceCommand);

      const result = getCommand("command with spaces");

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe("command with spaces");

      COMMANDS_CONTAINER.pop();
      container.remove(WhitespaceCommand);
    });

    test("should handle special characters in command names", () => {
      class SpecialCharsCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "test:command-name_v1.0";
        }
        public getDescription(): string {
          return "special chars command";
        }
      }

      container.add(SpecialCharsCommand);
      COMMANDS_CONTAINER.push(SpecialCharsCommand);

      const result = getCommand("test:command-name_v1.0");

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe("test:command-name_v1.0");

      COMMANDS_CONTAINER.pop();
      container.remove(SpecialCharsCommand);
    });

    test("should handle unicode characters in command names", () => {
      class UnicodeCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "命令";
        }
        public getDescription(): string {
          return "unicode command";
        }
      }

      container.add(UnicodeCommand);
      COMMANDS_CONTAINER.push(UnicodeCommand);

      const result = getCommand("命令");

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe("命令");

      COMMANDS_CONTAINER.pop();
      container.remove(UnicodeCommand);
    });

    test("should handle very long command names", () => {
      const longName = "a".repeat(1000);

      class LongNameCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return longName;
        }
        public getDescription(): string {
          return "long name command";
        }
      }

      container.add(LongNameCommand);
      COMMANDS_CONTAINER.push(LongNameCommand);

      const result = getCommand(longName);

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe(longName);

      COMMANDS_CONTAINER.pop();
      container.remove(LongNameCommand);
    });

    test("should handle command with dynamic getName implementation", () => {
      class DynamicNameCommand implements ICommand {
        private counter = 0;

        public run(_options: Record<string, unknown>): void {}

        public getName(): string {
          this.counter++;
          return `dynamic-${this.counter}`;
        }

        public getDescription(): string {
          return "dynamic name command";
        }
      }

      container.add(DynamicNameCommand);
      COMMANDS_CONTAINER.push(DynamicNameCommand);

      const result = getCommand("dynamic-1");

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe("dynamic-2");

      COMMANDS_CONTAINER.pop();
      container.remove(DynamicNameCommand);
    });

    test("should not match partial command names", () => {
      class PartialMatchCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "full-command-name";
        }
        public getDescription(): string {
          return "partial match command";
        }
      }

      container.add(PartialMatchCommand);
      COMMANDS_CONTAINER.push(PartialMatchCommand);

      // Full match should work
      const result = getCommand("full-command-name");
      expect(result).not.toBeNull();
      expect(result?.getName()).toBe("full-command-name");

      COMMANDS_CONTAINER.pop();
      container.remove(PartialMatchCommand);
    });
  });

  describe("Commands with Async Methods", () => {
    test("should retrieve command with async run method", () => {
      class AsyncCommand implements ICommand {
        public async run(): Promise<void> {
          await Promise.resolve();
        }

        public getName(): string {
          return "async";
        }

        public getDescription(): string {
          return "async command";
        }
      }

      container.add(AsyncCommand);
      COMMANDS_CONTAINER.push(AsyncCommand);

      const result = getCommand("async");

      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(AsyncCommand);

      if (result) {
        const runResult = result.run({});
        expect(runResult).toBeInstanceOf(Promise);
      }

      COMMANDS_CONTAINER.pop();
      container.remove(AsyncCommand);
    });

    test("should retrieve command with async getName method", () => {
      class AsyncGetNameCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}

        public getName(): string {
          return "async-getname";
        }

        public getDescription(): string {
          return "async getname command";
        }
      }

      container.add(AsyncGetNameCommand);
      COMMANDS_CONTAINER.push(AsyncGetNameCommand);

      const result = getCommand("async-getname");

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe("async-getname");

      COMMANDS_CONTAINER.pop();
      container.remove(AsyncGetNameCommand);
    });
  });

  describe("Commands with Typed Options", () => {
    test("should retrieve command with typed options", () => {
      interface BuildOptions extends Record<string, unknown> {
        production: boolean;
        output: string;
      }

      class TypedOptionsCommand implements ICommand<BuildOptions> {
        public run(_options: BuildOptions): void {}

        public getName(): string {
          return "typed-options";
        }

        public getDescription(): string {
          return "typed options command";
        }
      }

      container.add(TypedOptionsCommand);
      // Type assertion needed for typed options
      COMMANDS_CONTAINER.push(TypedOptionsCommand as unknown as new (...args: unknown[]) => ICommand);

      const result = getCommand("typed-options");

      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(TypedOptionsCommand);

      COMMANDS_CONTAINER.pop();
      container.remove(TypedOptionsCommand);
    });
  });

  describe("Real-world Command Scenarios", () => {
    test("should retrieve build command", () => {
      class BuildCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "build";
        }
        public getDescription(): string {
          return "Build the project";
        }
      }

      container.add(BuildCommand);
      COMMANDS_CONTAINER.push(BuildCommand);

      const result = getCommand("build");

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe("build");
      expect(result?.getDescription()).toBe("Build the project");

      COMMANDS_CONTAINER.pop();
      container.remove(BuildCommand);
    });

    test("should retrieve test command", () => {
      class TestCommand implements ICommand {
        public async run(): Promise<void> {
          await Promise.resolve();
        }

        public getName(): string {
          return "test";
        }

        public getDescription(): string {
          return "Run tests";
        }
      }

      container.add(TestCommand);
      COMMANDS_CONTAINER.push(TestCommand);

      const result = getCommand("test");

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe("test");

      COMMANDS_CONTAINER.pop();
      container.remove(TestCommand);
    });

    test("should retrieve deploy command", () => {
      class DeployCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}

        public getName(): string {
          return "deploy";
        }

        public getDescription(): string {
          return "Deploy the application";
        }
      }

      container.add(DeployCommand);
      COMMANDS_CONTAINER.push(DeployCommand);

      const result = getCommand("deploy");

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe("deploy");

      COMMANDS_CONTAINER.pop();
      container.remove(DeployCommand);
    });

    test("should successfully find registered commands", () => {
      class HelpCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "help";
        }
        public getDescription(): string {
          return "Display help information";
        }
      }

      container.add(HelpCommand);
      COMMANDS_CONTAINER.push(HelpCommand);

      const helpResult = getCommand("help");
      expect(helpResult).not.toBeNull();
      expect(helpResult?.getName()).toBe("help");
      expect(helpResult?.getDescription()).toBe("Display help information");

      COMMANDS_CONTAINER.pop();
      container.remove(HelpCommand);
    });
  });

  describe("Return Type", () => {
    test("should return ICommand instance or null", () => {
      class ReturnTypeCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "return-type";
        }
        public getDescription(): string {
          return "return type command";
        }
      }

      container.add(ReturnTypeCommand);
      COMMANDS_CONTAINER.push(ReturnTypeCommand);

      const result = getCommand("return-type");

      expect(result).not.toBeNull();
      expect(typeof result?.run).toBe("function");
      expect(typeof result?.getName).toBe("function");
      expect(typeof result?.getDescription).toBe("function");

      COMMANDS_CONTAINER.pop();
      container.remove(ReturnTypeCommand);
    });

    test("should return null type for non-existent command", () => {
      const result = getCommand("definitely-does-not-exist");

      expect(result).toBeNull();
      expect(result).not.toBeInstanceOf(Object);
    });

    test("should return null when command is not found but other commands exist", () => {
      class ArticleCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "sanitize:article";
        }
        public getDescription(): string {
          return "sanitize article command";
        }
      }

      class VideoCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "sanitize:video";
        }
        public getDescription(): string {
          return "sanitize video command";
        }
      }

      container.add(ArticleCommand);
      container.add(VideoCommand);
      COMMANDS_CONTAINER.push(ArticleCommand, VideoCommand);

      // Neither command matches "sanitize:other" — must return null, not the last checked command
      const result = getCommand("sanitize:other");
      expect(result).toBeNull();

      COMMANDS_CONTAINER.pop();
      COMMANDS_CONTAINER.pop();
      container.remove(ArticleCommand);
      container.remove(VideoCommand);
    });

    test("should return sanitize:video and not sanitize:article when both are registered", () => {
      class SanitizeArticleCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "sanitize:article";
        }
        public getDescription(): string {
          return "sanitize article";
        }
      }

      class SanitizeVideoCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "sanitize:video";
        }
        public getDescription(): string {
          return "sanitize video";
        }
      }

      container.add(SanitizeArticleCommand);
      container.add(SanitizeVideoCommand);
      // article is registered first — old buggy code would return article when searching for video
      COMMANDS_CONTAINER.push(SanitizeArticleCommand, SanitizeVideoCommand);

      const result = getCommand("sanitize:video");
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(SanitizeVideoCommand);
      expect(result?.getName()).toBe("sanitize:video");

      COMMANDS_CONTAINER.pop();
      COMMANDS_CONTAINER.pop();
      container.remove(SanitizeArticleCommand);
      container.remove(SanitizeVideoCommand);
    });
  });

  describe("Performance Considerations", () => {
    test("should handle large number of commands efficiently", () => {
      const commandCount = 100;
      const commands: Array<new (...args: unknown[]) => ICommand> = [];

      for (let i = 0; i < commandCount; i++) {
        class TestCommand implements ICommand {
          private readonly id = i;

          public run(_options: Record<string, unknown>): void {}

          public getName(): string {
            return `command-${this.id}`;
          }

          public getDescription(): string {
            return `test command ${this.id}`;
          }
        }

        container.add(TestCommand);
        COMMANDS_CONTAINER.push(TestCommand);
        commands.push(TestCommand);
      }

      const startTime = performance.now();
      const result = getCommand(`command-${commandCount - 1}`);
      const endTime = performance.now();

      expect(result).not.toBeNull();
      expect(endTime - startTime).toBeLessThan(100);

      for (let i = 0; i < commandCount; i++) {
        COMMANDS_CONTAINER.pop();
      }
    });
  });
});
