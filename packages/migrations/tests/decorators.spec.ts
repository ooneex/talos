import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { container, EContainerScope } from "@talosjs/container";
import { MIGRATIONS_CONTAINER } from "@/container";
import { decorator } from "@/decorators";
import type { IMigration, MigrationClassType } from "@/types";

describe("migration decorator", () => {
  // Store original container.add and restore after tests
  let originalAdd: typeof container.add;

  beforeEach(() => {
    // Store the original container.add method
    originalAdd = container.add;
    // Mock container.add
    container.add = jest.fn();
    // Clear the migrations container
    MIGRATIONS_CONTAINER.length = 0;
  });

  afterEach(() => {
    // Restore original container.add
    container.add = originalAdd;
    // Clear the migrations container
    MIGRATIONS_CONTAINER.length = 0;
    jest.clearAllMocks();
  });

  test("should accept a class with name starting with 'Migration'", () => {
    @decorator.migration()
    class MigrationTest implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    expect(container.add).toHaveBeenCalledTimes(1);
    expect(container.add).toHaveBeenCalledWith(MigrationTest, EContainerScope.Singleton);
    expect(MIGRATIONS_CONTAINER).toHaveLength(1);
    expect(MIGRATIONS_CONTAINER[0]).toBe(MigrationTest);
  });

  test("should use Singleton scope by default", () => {
    @decorator.migration()
    class MigrationDefaultScope implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    expect(container.add).toHaveBeenCalledWith(MigrationDefaultScope, EContainerScope.Singleton);
  });

  test("should accept custom scope parameter", () => {
    @decorator.migration(EContainerScope.Transient)
    class MigrationCustomScope implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    expect(container.add).toHaveBeenCalledWith(MigrationCustomScope, EContainerScope.Transient);
  });

  test("should accept Request scope", () => {
    @decorator.migration(EContainerScope.Request)
    class MigrationRequestScope implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    expect(container.add).toHaveBeenCalledTimes(1);
    expect(container.add).toHaveBeenCalledWith(MigrationRequestScope, EContainerScope.Request);
    expect(MIGRATIONS_CONTAINER).toHaveLength(1);
  });

  test("should handle multiple migrations", () => {
    @decorator.migration()
    class MigrationFirst implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    @decorator.migration()
    class MigrationSecond implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "002";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    expect(container.add).toHaveBeenCalledTimes(2);
    expect(MIGRATIONS_CONTAINER).toHaveLength(2);
    expect(MIGRATIONS_CONTAINER[0]).toBe(MigrationFirst);
    expect(MIGRATIONS_CONTAINER[1]).toBe(MigrationSecond);
  });

  test("should accept class with 'Migration' prefix only", () => {
    class Migration implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    decorator.migration()(Migration as MigrationClassType);

    expect(container.add).toHaveBeenCalledTimes(1);
    expect(MIGRATIONS_CONTAINER).toHaveLength(1);
  });

  test("should accept class with 'Migration' followed by numbers", () => {
    class Migration20231201 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "20231201";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    decorator.migration()(Migration20231201 as MigrationClassType);

    expect(container.add).toHaveBeenCalledTimes(1);
    expect(MIGRATIONS_CONTAINER).toHaveLength(1);
  });

  test("should accept class with 'Migration' followed by special characters", () => {
    class Migration_Create_Users_Table implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    decorator.migration()(Migration_Create_Users_Table as MigrationClassType);

    expect(container.add).toHaveBeenCalledTimes(1);
    expect(MIGRATIONS_CONTAINER).toHaveLength(1);
  });

  test("should add migration to container before adding to migrations array", () => {
    const callOrder: string[] = [];

    container.add = jest.fn(() => {
      callOrder.push("container.add");
    }) as typeof container.add;

    const originalPush = MIGRATIONS_CONTAINER.push;
    MIGRATIONS_CONTAINER.push = jest.fn((...args) => {
      callOrder.push("MIGRATIONS_CONTAINER.push");
      return originalPush.call(MIGRATIONS_CONTAINER, ...args);
    }) as typeof MIGRATIONS_CONTAINER.push;

    @decorator.migration()
    class MigrationOrder implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    expect(callOrder).toEqual(["container.add", "MIGRATIONS_CONTAINER.push"]);
    expect(MigrationOrder).toBeDefined();

    // Restore original push
    MIGRATIONS_CONTAINER.push = originalPush;
  });

  test("should return void", () => {
    const migrationDecorator = decorator.migration();

    class MigrationReturnTest implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    const result = migrationDecorator(MigrationReturnTest as MigrationClassType);

    expect(result).toBeUndefined();
  });

  test("should work with class extending a base class", () => {
    abstract class BaseMigration implements IMigration {
      abstract up(): Promise<void>;
      abstract down(): Promise<void>;
      abstract getVersion(): string;
      abstract getDependencies(): MigrationClassType[];
    }

    @decorator.migration()
    class MigrationExtended extends BaseMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    expect(container.add).toHaveBeenCalledTimes(1);
    expect(MIGRATIONS_CONTAINER).toHaveLength(1);
    expect(MigrationExtended).toBeDefined();
  });

  test("should work with class that has constructor parameters", () => {
    @decorator.migration()
    class MigrationWithConstructor implements IMigration {
      constructor(private readonly version: string) {}

      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return this.version;
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    expect(container.add).toHaveBeenCalledTimes(1);
    expect(MIGRATIONS_CONTAINER).toHaveLength(1);
    expect(MigrationWithConstructor).toBeDefined();
  });

  test("should work with class that has additional methods", () => {
    @decorator.migration()
    class MigrationWithExtraMethods implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }

      public publicMethod(): string {
        return "test";
      }
    }

    expect(container.add).toHaveBeenCalledTimes(1);
    expect(MIGRATIONS_CONTAINER).toHaveLength(1);
    expect(MigrationWithExtraMethods).toBeDefined();
  });
});
