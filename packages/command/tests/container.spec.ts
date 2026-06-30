import { describe, expect, test } from "bun:test";
import { COMMANDS_CONTAINER } from "@/container";
import type { ICommand } from "@/types";

describe("COMMANDS_CONTAINER", () => {
  describe("Initialization", () => {
    test("should be defined", () => {
      expect(COMMANDS_CONTAINER).toBeDefined();
    });

    test("should be an array", () => {
      expect(Array.isArray(COMMANDS_CONTAINER)).toBe(true);
    });

    test("should be exported as a mutable array", () => {
      const initialLength = COMMANDS_CONTAINER.length;

      class TestCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "test";
        }
        public getDescription(): string {
          return "test command";
        }
      }

      COMMANDS_CONTAINER.push(TestCommand);
      expect(COMMANDS_CONTAINER.length).toBe(initialLength + 1);

      // Cleanup
      COMMANDS_CONTAINER.pop();
      expect(COMMANDS_CONTAINER.length).toBe(initialLength);
    });
  });

  describe("Type Compatibility", () => {
    test("should accept CommandClassType elements", () => {
      class ValidCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "valid";
        }
        public getDescription(): string {
          return "valid command";
        }
      }

      const initialLength = COMMANDS_CONTAINER.length;
      COMMANDS_CONTAINER.push(ValidCommand);

      expect(COMMANDS_CONTAINER[COMMANDS_CONTAINER.length - 1]).toBe(ValidCommand);

      // Cleanup
      COMMANDS_CONTAINER.pop();
      expect(COMMANDS_CONTAINER.length).toBe(initialLength);
    });

    test("should store command class constructors not instances", () => {
      class StorageTestCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "storage-test";
        }
        public getDescription(): string {
          return "storage test command";
        }
      }

      const initialLength = COMMANDS_CONTAINER.length;
      COMMANDS_CONTAINER.push(StorageTestCommand);

      const stored = COMMANDS_CONTAINER[COMMANDS_CONTAINER.length - 1];
      expect(typeof stored).toBe("function");

      if (stored) {
        expect(stored.name).toBe("StorageTestCommand");

        // Should be able to instantiate from stored class
        const instance = new stored();
        expect(instance).toBeInstanceOf(StorageTestCommand);
        expect(instance.getName()).toBe("storage-test");
      }

      // Cleanup
      COMMANDS_CONTAINER.pop();
      expect(COMMANDS_CONTAINER.length).toBe(initialLength);
    });
  });

  describe("Array Operations", () => {
    test("should support push operation", () => {
      class PushCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "push";
        }
        public getDescription(): string {
          return "push command";
        }
      }

      const initialLength = COMMANDS_CONTAINER.length;
      COMMANDS_CONTAINER.push(PushCommand);

      expect(COMMANDS_CONTAINER.length).toBe(initialLength + 1);

      // Cleanup
      COMMANDS_CONTAINER.pop();
    });

    test("should support pop operation", () => {
      class PopCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "pop";
        }
        public getDescription(): string {
          return "pop command";
        }
      }

      COMMANDS_CONTAINER.push(PopCommand);
      const initialLength = COMMANDS_CONTAINER.length;

      const popped = COMMANDS_CONTAINER.pop();

      expect(popped).toBe(PopCommand);
      expect(COMMANDS_CONTAINER.length).toBe(initialLength - 1);
    });

    test("should support find operation", () => {
      class FindCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "find-test";
        }
        public getDescription(): string {
          return "find test command";
        }
      }

      COMMANDS_CONTAINER.push(FindCommand);

      const found = COMMANDS_CONTAINER.find((cmd) => cmd.name === "FindCommand");

      expect(found).toBe(FindCommand);

      // Cleanup
      COMMANDS_CONTAINER.pop();
    });

    test("should support filter operation", () => {
      class FilterCommand1 implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "filter-1";
        }
        public getDescription(): string {
          return "filter command 1";
        }
      }

      class FilterCommand2 implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "filter-2";
        }
        public getDescription(): string {
          return "filter command 2";
        }
      }

      COMMANDS_CONTAINER.push(FilterCommand1, FilterCommand2);
      const initialLength = COMMANDS_CONTAINER.length;

      const filtered = COMMANDS_CONTAINER.filter((cmd) => cmd.name.startsWith("FilterCommand"));

      expect(filtered.length).toBeGreaterThanOrEqual(2);
      expect(filtered).toContain(FilterCommand1);
      expect(filtered).toContain(FilterCommand2);

      // Cleanup
      COMMANDS_CONTAINER.pop();
      COMMANDS_CONTAINER.pop();
      expect(COMMANDS_CONTAINER.length).toBe(initialLength - 2);
    });

    test("should support map operation", () => {
      class MapCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "map";
        }
        public getDescription(): string {
          return "map command";
        }
      }

      COMMANDS_CONTAINER.push(MapCommand);

      const names = COMMANDS_CONTAINER.map((cmd) => cmd.name);

      expect(Array.isArray(names)).toBe(true);
      expect(names).toContain("MapCommand");

      // Cleanup
      COMMANDS_CONTAINER.pop();
    });

    test("should support forEach operation", () => {
      class ForEachCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "foreach";
        }
        public getDescription(): string {
          return "foreach command";
        }
      }

      COMMANDS_CONTAINER.push(ForEachCommand);

      let count = 0;
      COMMANDS_CONTAINER.forEach((cmd) => {
        if (cmd.name === "ForEachCommand") {
          count++;
        }
      });

      expect(count).toBe(1);

      // Cleanup
      COMMANDS_CONTAINER.pop();
    });
  });

  describe("Multiple Commands", () => {
    test("should store multiple different commands", () => {
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

      const initialLength = COMMANDS_CONTAINER.length;

      COMMANDS_CONTAINER.push(Command1, Command2, Command3);

      expect(COMMANDS_CONTAINER.length).toBe(initialLength + 3);
      expect(COMMANDS_CONTAINER).toContain(Command1);
      expect(COMMANDS_CONTAINER).toContain(Command2);
      expect(COMMANDS_CONTAINER).toContain(Command3);

      // Cleanup
      COMMANDS_CONTAINER.pop();
      COMMANDS_CONTAINER.pop();
      COMMANDS_CONTAINER.pop();
    });

    test("should maintain order of commands", () => {
      class OrderCommand1 implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "order1";
        }
        public getDescription(): string {
          return "order command 1";
        }
      }

      class OrderCommand2 implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "order2";
        }
        public getDescription(): string {
          return "order command 2";
        }
      }

      const initialLength = COMMANDS_CONTAINER.length;

      COMMANDS_CONTAINER.push(OrderCommand1);
      COMMANDS_CONTAINER.push(OrderCommand2);

      const index1 = COMMANDS_CONTAINER.indexOf(OrderCommand1);
      const index2 = COMMANDS_CONTAINER.indexOf(OrderCommand2);

      expect(index1).toBeGreaterThanOrEqual(0);
      expect(index2).toBeGreaterThanOrEqual(0);
      expect(index2).toBeGreaterThan(index1);

      // Cleanup
      COMMANDS_CONTAINER.pop();
      COMMANDS_CONTAINER.pop();
      expect(COMMANDS_CONTAINER.length).toBe(initialLength);
    });
  });

  describe("Edge Cases", () => {
    test("should handle duplicate command class references", () => {
      class DuplicateCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "duplicate";
        }
        public getDescription(): string {
          return "duplicate command";
        }
      }

      const initialLength = COMMANDS_CONTAINER.length;

      COMMANDS_CONTAINER.push(DuplicateCommand);
      COMMANDS_CONTAINER.push(DuplicateCommand);

      expect(COMMANDS_CONTAINER.length).toBe(initialLength + 2);

      const occurrences = COMMANDS_CONTAINER.filter((cmd) => cmd === DuplicateCommand).length;
      expect(occurrences).toBeGreaterThanOrEqual(2);

      // Cleanup
      COMMANDS_CONTAINER.pop();
      COMMANDS_CONTAINER.pop();
    });

    test("should handle commands with constructor parameters", () => {
      class ParameterizedCommand implements ICommand {
        constructor(config: string, opts: Record<string, unknown>) {
          void config;
          void opts;
        }

        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "parameterized";
        }
        public getDescription(): string {
          return "parameterized command";
        }
      }

      const initialLength = COMMANDS_CONTAINER.length;

      COMMANDS_CONTAINER.push(ParameterizedCommand);

      expect(COMMANDS_CONTAINER.length).toBe(initialLength + 1);
      expect(COMMANDS_CONTAINER[COMMANDS_CONTAINER.length - 1]).toBe(ParameterizedCommand);

      // Cleanup
      COMMANDS_CONTAINER.pop();
    });

    test("should handle commands with async run method", () => {
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

      const initialLength = COMMANDS_CONTAINER.length;

      COMMANDS_CONTAINER.push(AsyncCommand);

      expect(COMMANDS_CONTAINER.length).toBe(initialLength + 1);

      // Verify the stored class can be instantiated and its run method is async
      const instance = new AsyncCommand();
      const result = instance.run();
      expect(result).toBeInstanceOf(Promise);

      // Cleanup
      COMMANDS_CONTAINER.pop();
    });

    test("should handle commands with typed options", () => {
      interface BuildOptions extends Record<string, unknown> {
        production: boolean;
        minify: boolean;
      }

      class TypedOptionsCommand implements ICommand<BuildOptions> {
        public run(_options: BuildOptions): void {}

        public getName(): string {
          return "typed-options";
        }

        public getDescription(): string {
          return "command with typed options";
        }
      }

      const initialLength = COMMANDS_CONTAINER.length;

      // Type assertion needed for typed options
      COMMANDS_CONTAINER.push(TypedOptionsCommand as unknown as new (...args: unknown[]) => ICommand);

      expect(COMMANDS_CONTAINER.length).toBe(initialLength + 1);

      // Cleanup
      COMMANDS_CONTAINER.pop();
    });
  });

  describe("Memory and References", () => {
    test("should maintain reference equality for same class", () => {
      class RefCommand implements ICommand {
        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "ref";
        }
        public getDescription(): string {
          return "ref command";
        }
      }

      COMMANDS_CONTAINER.push(RefCommand);
      const stored = COMMANDS_CONTAINER[COMMANDS_CONTAINER.length - 1];

      expect(stored === RefCommand).toBe(true);

      // Cleanup
      COMMANDS_CONTAINER.pop();
    });

    test("should not modify the original class when stored", () => {
      class ImmutableCommand implements ICommand {
        public static testProperty = "original";

        public run(_options: Record<string, unknown>): void {}
        public getName(): string {
          return "immutable";
        }
        public getDescription(): string {
          return "immutable command";
        }
      }

      const originalValue = ImmutableCommand.testProperty;

      COMMANDS_CONTAINER.push(ImmutableCommand);

      expect(ImmutableCommand.testProperty).toBe(originalValue);

      // Cleanup
      COMMANDS_CONTAINER.pop();
    });
  });
});
