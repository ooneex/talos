import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { container, EContainerScope } from "@talosjs/container";
import { COMMANDS_CONTAINER } from "@/container";
import { decorator } from "@/decorators";
import type { ICommand } from "@/types";

describe("decorator.command", () => {
  let initialCommandsLength: number;

  beforeEach(() => {
    // Store initial state
    initialCommandsLength = COMMANDS_CONTAINER.length;
  });

  afterEach(() => {
    // Clean up commands added during tests
    while (COMMANDS_CONTAINER.length > initialCommandsLength) {
      COMMANDS_CONTAINER.pop();
    }
  });

  describe("Basic Functionality", () => {
    test("should be defined", () => {
      expect(decorator.command).toBeDefined();
      expect(typeof decorator.command).toBe("function");
    });

    test("should return a decorator function", () => {
      const commandDecorator = decorator.command();
      expect(typeof commandDecorator).toBe("function");
    });

    test("should accept EContainerScope parameter", () => {
      const singletonDecorator = decorator.command(EContainerScope.Singleton);
      const transientDecorator = decorator.command(EContainerScope.Transient);
      const requestDecorator = decorator.command(EContainerScope.Request);

      expect(typeof singletonDecorator).toBe("function");
      expect(typeof transientDecorator).toBe("function");
      expect(typeof requestDecorator).toBe("function");
    });

    test("should use Singleton scope by default", () => {
      @decorator.command()
      class DefaultScopeCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "default-scope";
        }
        public getDescription(): string {
          return "default scope command";
        }
      }

      expect(container.has(DefaultScopeCommand)).toBe(true);

      const instance1 = container.get(DefaultScopeCommand);
      const instance2 = container.get(DefaultScopeCommand);

      expect(instance1).toBe(instance2);
    });
  });

  describe("Container Integration", () => {
    test("should add command to container", () => {
      @decorator.command()
      class ContainerCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "container";
        }
        public getDescription(): string {
          return "container command";
        }
      }

      expect(container.has(ContainerCommand)).toBe(true);
    });

    test("should add command to container with Singleton scope", () => {
      @decorator.command(EContainerScope.Singleton)
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

      const instance1 = container.get(SingletonCommand);
      const instance2 = container.get(SingletonCommand);

      expect(instance1).toBe(instance2);
      expect(instance1.instanceId).toBe(instance2.instanceId);
    });

    test("should add command to container with Transient scope", () => {
      @decorator.command(EContainerScope.Transient)
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

      const instance1 = container.get(TransientCommand);
      const instance2 = container.get(TransientCommand);

      expect(instance1).not.toBe(instance2);
      expect(instance1.instanceId).not.toBe(instance2.instanceId);
    });

    test("should add command to container with Request scope", () => {
      @decorator.command(EContainerScope.Request)
      class RequestCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "request";
        }
        public getDescription(): string {
          return "request command";
        }
      }

      expect(container.has(RequestCommand)).toBe(true);
      const instance = container.get(RequestCommand);
      expect(instance).toBeInstanceOf(RequestCommand);
    });
  });

  describe("COMMANDS_CONTAINER Integration", () => {
    test("should add command to COMMANDS_CONTAINER", () => {
      @decorator.command()
      class RegistryCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "registry";
        }
        public getDescription(): string {
          return "registry command";
        }
      }

      expect(COMMANDS_CONTAINER).toContain(RegistryCommand);
    });

    test("should add multiple commands to COMMANDS_CONTAINER", () => {
      @decorator.command()
      class FirstCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "first";
        }
        public getDescription(): string {
          return "first command";
        }
      }

      @decorator.command()
      class SecondCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "second";
        }
        public getDescription(): string {
          return "second command";
        }
      }

      expect(COMMANDS_CONTAINER).toContain(FirstCommand);
      expect(COMMANDS_CONTAINER).toContain(SecondCommand);
    });

    test("should maintain order of commands in COMMANDS_CONTAINER", () => {
      const startLength = COMMANDS_CONTAINER.length;

      @decorator.command()
      class OrderFirstCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "order-first";
        }
        public getDescription(): string {
          return "order first command";
        }
      }

      @decorator.command()
      class OrderSecondCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "order-second";
        }
        public getDescription(): string {
          return "order second command";
        }
      }

      const firstIndex = COMMANDS_CONTAINER.indexOf(OrderFirstCommand);
      const secondIndex = COMMANDS_CONTAINER.indexOf(OrderSecondCommand);

      expect(firstIndex).toBeGreaterThanOrEqual(startLength);
      expect(secondIndex).toBeGreaterThan(firstIndex);
    });
  });

  describe("Command Class Features", () => {
    test("should work with commands without dependencies", () => {
      @decorator.command()
      class NoDependencyCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}

        public getName(): string {
          return "no-dependency";
        }

        public getDescription(): string {
          return "command without dependencies";
        }
      }

      const instance = container.get(NoDependencyCommand);
      expect(instance).toBeInstanceOf(NoDependencyCommand);
      expect(instance.getName()).toBe("no-dependency");
    });

    test("should work with commands that have async run method", () => {
      @decorator.command()
      class AsyncRunCommand implements ICommand {
        public async run(): Promise<void> {
          await Promise.resolve();
        }

        public getName(): string {
          return "async-run";
        }

        public getDescription(): string {
          return "async run command";
        }
      }

      const instance = container.get(AsyncRunCommand);
      const result = instance.run();
      expect(result).toBeInstanceOf(Promise);
    });

    test("should work with commands that have typed options", () => {
      interface BuildOptions extends Record<string, unknown> {
        production: boolean;
        minify: boolean;
        output: string;
      }

      class TypedCommand implements ICommand<BuildOptions> {
        public run(_options: BuildOptions): void {}

        public getName(): string {
          return "typed";
        }

        public getDescription(): string {
          return "command with typed options";
        }
      }

      // Manually add to container without decorator due to type constraints
      container.add(TypedCommand as unknown as new (...args: unknown[]) => ICommand);
      COMMANDS_CONTAINER.push(TypedCommand as unknown as new (...args: unknown[]) => ICommand);

      const instance = container.get(TypedCommand);
      expect(instance).toBeInstanceOf(TypedCommand);
      expect(instance.getName()).toBe("typed");

      // Cleanup
      COMMANDS_CONTAINER.pop();
    });

    test("should work with commands that have static properties", () => {
      @decorator.command()
      class StaticPropsCommand implements ICommand {
        public static readonly version = "1.0.0";
        public static readonly author = "Test Author";

        public run(_options: Record<string, unknown>): void {}

        public getName(): string {
          return "static-props";
        }

        public getDescription(): string {
          return "static props command";
        }
      }

      expect(StaticPropsCommand.version).toBe("1.0.0");
      expect(StaticPropsCommand.author).toBe("Test Author");

      const instance = container.get(StaticPropsCommand);
      expect(instance).toBeInstanceOf(StaticPropsCommand);
    });

    test("should work with commands that have private methods", () => {
      @decorator.command()
      class PrivateMethodsCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {
          this.privateHelper();
        }

        public getName(): string {
          return "private-methods";
        }

        public getDescription(): string {
          return "private methods command";
        }

        private privateHelper(): string {
          return "helper result";
        }
      }

      const instance = container.get(PrivateMethodsCommand);
      expect(instance).toBeInstanceOf(PrivateMethodsCommand);
    });
  });

  describe("Multiple Decorations", () => {
    test("should handle multiple commands with different scopes", () => {
      @decorator.command(EContainerScope.Singleton)
      class SingletonMultiCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "singleton-multi";
        }
        public getDescription(): string {
          return "singleton multi command";
        }
      }

      @decorator.command(EContainerScope.Transient)
      class TransientMultiCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "transient-multi";
        }
        public getDescription(): string {
          return "transient multi command";
        }
      }

      expect(container.has(SingletonMultiCommand)).toBe(true);
      expect(container.has(TransientMultiCommand)).toBe(true);
      expect(COMMANDS_CONTAINER).toContain(SingletonMultiCommand);
      expect(COMMANDS_CONTAINER).toContain(TransientMultiCommand);
    });

    test("should handle commands with same name but different classes", () => {
      @decorator.command()
      class SameNameACommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "same-name";
        }
        public getDescription(): string {
          return "command A";
        }
      }

      @decorator.command()
      class SameNameBCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "same-name";
        }
        public getDescription(): string {
          return "command B";
        }
      }

      expect(COMMANDS_CONTAINER).toContain(SameNameACommand);
      expect(COMMANDS_CONTAINER).toContain(SameNameBCommand);

      const instanceA = container.get(SameNameACommand);
      const instanceB = container.get(SameNameBCommand);

      expect(instanceA).toBeInstanceOf(SameNameACommand);
      expect(instanceB).toBeInstanceOf(SameNameBCommand);
      expect(instanceA).not.toBe(instanceB);
    });
  });

  describe("Edge Cases", () => {
    test("should handle command with empty methods", () => {
      @decorator.command()
      class EmptyCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "";
        }
        public getDescription(): string {
          return "";
        }
      }

      const instance = container.get(EmptyCommand);
      expect(instance.getName()).toBe("");
      expect(instance.getDescription()).toBe("");
    });

    test("should handle command with complex getName logic", () => {
      @decorator.command()
      class ComplexNameCommand implements ICommand {
        private readonly prefix = "complex";
        private readonly suffix = "command";

        public run(_options: Record<string, unknown>): void {}

        public getName(): string {
          return `${this.prefix}-${this.suffix}`;
        }

        public getDescription(): string {
          return "complex name command";
        }
      }

      const instance = container.get(ComplexNameCommand);
      expect(instance.getName()).toBe("complex-command");
    });

    test("should handle command with getters and setters", () => {
      @decorator.command()
      class GetterSetterCommand implements ICommand {
        private _config = "default";

        public get config(): string {
          return this._config;
        }

        public set config(value: string) {
          this._config = value;
        }

        public run(_options: Record<string, unknown>): void {}

        public getName(): string {
          return "getter-setter";
        }

        public getDescription(): string {
          return "getter setter command";
        }
      }

      const instance = container.get(GetterSetterCommand);
      expect(instance.config).toBe("default");

      instance.config = "updated";
      expect(instance.config).toBe("updated");
    });

    test("should handle command with long description", () => {
      const longDescription = "A".repeat(1000);

      @decorator.command()
      class LongDescCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "long-desc";
        }
        public getDescription(): string {
          return longDescription;
        }
      }

      const instance = container.get(LongDescCommand);
      expect(instance.getDescription()).toBe(longDescription);
      expect(instance.getDescription().length).toBe(1000);
    });

    test("should handle command with special characters in name", () => {
      @decorator.command()
      class SpecialCharsCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "test:command-name_v1.0";
        }
        public getDescription(): string {
          return "special chars command";
        }
      }

      const instance = container.get(SpecialCharsCommand);
      expect(instance.getName()).toBe("test:command-name_v1.0");
    });

    test("should handle command with unicode in description", () => {
      @decorator.command()
      class UnicodeCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "unicode";
        }
        public getDescription(): string {
          return "命令描述 コマンド説明 🚀";
        }
      }

      const instance = container.get(UnicodeCommand);
      expect(instance.getDescription()).toBe("命令描述 コマンド説明 🚀");
    });
  });

  describe("Decorator Behavior", () => {
    test("should return the decorated class unchanged", () => {
      @decorator.command()
      class ReturnedCommand implements ICommand {
        public static testProperty = "test";

        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "returned";
        }
        public getDescription(): string {
          return "returned command";
        }
      }

      expect(ReturnedCommand.testProperty).toBe("test");
      expect(typeof ReturnedCommand).toBe("function");
    });

    test("should not interfere with class inheritance", () => {
      abstract class BaseCommand implements ICommand {
        public abstract run(_options: Record<string, unknown>): void;
        public abstract getName(): string;

        public getDescription(): string {
          return "base description";
        }

        protected getBaseValue(): string {
          return "base value";
        }
      }

      @decorator.command()
      class InheritedCommand extends BaseCommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "inherited";
        }
      }

      const instance = container.get(InheritedCommand);
      expect(instance).toBeInstanceOf(InheritedCommand);
      expect(instance).toBeInstanceOf(BaseCommand);
      expect(instance.getDescription()).toBe("base description");
    });

    test("should work with classes that implement multiple interfaces", () => {
      interface ILoggable {
        log: (message: string) => void;
      }

      interface IValidatable {
        validate: () => boolean;
      }

      @decorator.command()
      class MultiInterfaceCommand implements ICommand, ILoggable, IValidatable {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "multi-interface";
        }
        public getDescription(): string {
          return "multi interface command";
        }
        public log(message: string): void {
          void message;
        }
        public validate(): boolean {
          return true;
        }
      }

      const instance = container.get(MultiInterfaceCommand);
      expect(instance).toBeInstanceOf(MultiInterfaceCommand);
      expect(typeof instance.log).toBe("function");
      expect(typeof instance.validate).toBe("function");
      expect(instance.validate()).toBe(true);
    });
  });

  describe("Real-world Command Scenarios", () => {
    test("should handle build command scenario", () => {
      interface BuildOptions extends Record<string, unknown> {
        production: boolean;
        output: string;
      }

      class BuildCommand implements ICommand<BuildOptions> {
        public run(_options: BuildOptions): void {}

        public getName(): string {
          return "build";
        }

        public getDescription(): string {
          return "Build the project for production or development";
        }
      }

      // Manually add to container without decorator due to type constraints
      container.add(BuildCommand as unknown as new (...args: unknown[]) => ICommand, EContainerScope.Singleton);
      COMMANDS_CONTAINER.push(BuildCommand as unknown as new (...args: unknown[]) => ICommand);

      expect(container.has(BuildCommand)).toBe(true);
      expect(COMMANDS_CONTAINER).toContain(BuildCommand as unknown as new (...args: unknown[]) => ICommand);

      const instance = container.get(BuildCommand);
      expect(instance.getName()).toBe("build");

      // Cleanup
      COMMANDS_CONTAINER.pop();
    });

    test("should handle test command scenario", () => {
      @decorator.command(EContainerScope.Transient)
      class TestCommand implements ICommand {
        public async run(): Promise<void> {
          await Promise.resolve();
        }

        public getName(): string {
          return "test";
        }

        public getDescription(): string {
          return "Run tests with coverage";
        }
      }

      const instance1 = container.get(TestCommand);
      const instance2 = container.get(TestCommand);

      expect(instance1).not.toBe(instance2);
    });

    test("should handle deploy command without dependencies", () => {
      @decorator.command()
      class DeployCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}

        public getName(): string {
          return "deploy";
        }

        public getDescription(): string {
          return "Deploy the application to cloud";
        }
      }

      const instance = container.get(DeployCommand);
      expect(instance).toBeInstanceOf(DeployCommand);
      expect(instance.getName()).toBe("deploy");
    });
  });
});
