import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { container } from "@talosjs/container";
import { MIGRATIONS_CONTAINER } from "@/container";
import { getMigrations } from "@/getMigrations";
import type { IMigration, MigrationClassType } from "@/types";

describe("getMigrations", () => {
  let originalContainerGet: typeof container.get;

  beforeEach(() => {
    // Store original container.get
    originalContainerGet = container.get;
    // Clear migrations container
    MIGRATIONS_CONTAINER.length = 0;
  });

  afterEach(() => {
    // Restore original container.get
    container.get = originalContainerGet;
    // Clear migrations container
    MIGRATIONS_CONTAINER.length = 0;
    jest.clearAllMocks();
  });

  test("should return empty array when no migrations are registered", () => {
    const migrations = getMigrations();

    expect(migrations).toEqual([]);
    expect(migrations).toHaveLength(0);
  });

  test("should return single migration when one is registered", () => {
    class Migration001 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    const instance = new Migration001();
    MIGRATIONS_CONTAINER.push(Migration001 as MigrationClassType);

    container.get = jest.fn().mockReturnValue(instance);

    const migrations = getMigrations();

    expect(migrations).toHaveLength(1);
    expect(migrations[0]).toBe(instance);
    expect(container.get).toHaveBeenCalledTimes(1);
    expect(container.get).toHaveBeenCalledWith(Migration001);
  });

  test("should return multiple migrations", () => {
    class Migration001 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    class Migration002 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "002";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    const instance1 = new Migration001();
    const instance2 = new Migration002();

    MIGRATIONS_CONTAINER.push(Migration001 as MigrationClassType);
    MIGRATIONS_CONTAINER.push(Migration002 as MigrationClassType);

    container.get = jest.fn((MigrationClass) => {
      if (MigrationClass === Migration001) return instance1;
      if (MigrationClass === Migration002) return instance2;
      throw new Error("Unexpected migration class");
    }) as typeof container.get;

    const migrations = getMigrations();

    expect(migrations).toHaveLength(2);
    expect(container.get).toHaveBeenCalledTimes(2);
  });

  test("should sort migrations by version in ascending order", () => {
    class Migration003 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "003";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    class Migration001 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    class Migration002 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "002";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    const instance1 = new Migration001();
    const instance2 = new Migration002();
    const instance3 = new Migration003();

    // Add in non-sorted order
    MIGRATIONS_CONTAINER.push(Migration003 as MigrationClassType);
    MIGRATIONS_CONTAINER.push(Migration001 as MigrationClassType);
    MIGRATIONS_CONTAINER.push(Migration002 as MigrationClassType);

    container.get = jest.fn((MigrationClass) => {
      if (MigrationClass === Migration001) return instance1;
      if (MigrationClass === Migration002) return instance2;
      if (MigrationClass === Migration003) return instance3;
      throw new Error("Unexpected migration class");
    }) as typeof container.get;

    const migrations = getMigrations();

    expect(migrations).toHaveLength(3);
    expect(migrations[0]?.getVersion()).toBe("001");
    expect(migrations[1]?.getVersion()).toBe("002");
    expect(migrations[2]?.getVersion()).toBe("003");
  });

  test("should sort migrations numerically, not lexicographically", () => {
    class Migration10 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "10";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    class Migration2 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "2";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    class Migration100 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "100";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    const instance2 = new Migration2();
    const instance10 = new Migration10();
    const instance100 = new Migration100();

    MIGRATIONS_CONTAINER.push(Migration100 as MigrationClassType);
    MIGRATIONS_CONTAINER.push(Migration10 as MigrationClassType);
    MIGRATIONS_CONTAINER.push(Migration2 as MigrationClassType);

    container.get = jest.fn((MigrationClass) => {
      if (MigrationClass === Migration2) return instance2;
      if (MigrationClass === Migration10) return instance10;
      if (MigrationClass === Migration100) return instance100;
      throw new Error("Unexpected migration class");
    }) as typeof container.get;

    const migrations = getMigrations();

    expect(migrations).toHaveLength(3);
    // Should be sorted as 2, 10, 100 (not 10, 100, 2)
    expect(migrations[0]?.getVersion()).toBe("2");
    expect(migrations[1]?.getVersion()).toBe("10");
    expect(migrations[2]?.getVersion()).toBe("100");
  });

  test("should handle timestamp-based versions", () => {
    class Migration20250101000000000 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "20250101000000000";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    class Migration20241231235959999 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "20241231235959999";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    class Migration20250630120000000 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "20250630120000000";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    const instance1 = new Migration20250101000000000();
    const instance2 = new Migration20241231235959999();
    const instance3 = new Migration20250630120000000();

    MIGRATIONS_CONTAINER.push(Migration20250630120000000 as MigrationClassType);
    MIGRATIONS_CONTAINER.push(Migration20250101000000000 as MigrationClassType);
    MIGRATIONS_CONTAINER.push(Migration20241231235959999 as MigrationClassType);

    container.get = jest.fn((MigrationClass) => {
      if (MigrationClass === Migration20250101000000000) return instance1;
      if (MigrationClass === Migration20241231235959999) return instance2;
      if (MigrationClass === Migration20250630120000000) return instance3;
      throw new Error("Unexpected migration class");
    }) as typeof container.get;

    const migrations = getMigrations();

    expect(migrations).toHaveLength(3);
    expect(migrations[0]?.getVersion()).toBe("20241231235959999");
    expect(migrations[1]?.getVersion()).toBe("20250101000000000");
    expect(migrations[2]?.getVersion()).toBe("20250630120000000");
  });

  test("should retrieve instances from container for each migration class", () => {
    class Migration001 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    class Migration002 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "002";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    MIGRATIONS_CONTAINER.push(Migration001 as MigrationClassType);
    MIGRATIONS_CONTAINER.push(Migration002 as MigrationClassType);

    const mockGet = jest.fn((MigrationClass) => {
      if (MigrationClass === Migration001) return new Migration001();
      if (MigrationClass === Migration002) return new Migration002();
      throw new Error("Unexpected migration class");
    }) as typeof container.get;

    container.get = mockGet;

    getMigrations();

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenCalledWith(Migration001);
    expect(mockGet).toHaveBeenCalledWith(Migration002);
  });

  test("should return IMigration instances", () => {
    class Migration001 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    const instance = new Migration001();
    MIGRATIONS_CONTAINER.push(Migration001 as MigrationClassType);
    container.get = jest.fn().mockReturnValue(instance);

    const migrations = getMigrations();

    expect(migrations[0]).toHaveProperty("up");
    expect(migrations[0]).toHaveProperty("down");
    expect(migrations[0]).toHaveProperty("getVersion");
    expect(typeof migrations[0]?.up).toBe("function");
    expect(typeof migrations[0]?.down).toBe("function");
    expect(typeof migrations[0]?.getVersion).toBe("function");
  });

  test("should maintain singleton behavior from container", () => {
    class Migration001 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    const singletonInstance = new Migration001();
    MIGRATIONS_CONTAINER.push(Migration001 as MigrationClassType);
    container.get = jest.fn().mockReturnValue(singletonInstance);

    const migrations1 = getMigrations();
    const migrations2 = getMigrations();

    // Same instance should be returned (depends on container behavior)
    expect(migrations1[0]).toBe(singletonInstance);
    expect(migrations2[0]).toBe(singletonInstance);
  });

  test("should handle migrations with same version (edge case)", () => {
    class Migration001A implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    class Migration001B implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    const instanceA = new Migration001A();
    const instanceB = new Migration001B();

    MIGRATIONS_CONTAINER.push(Migration001A as MigrationClassType);
    MIGRATIONS_CONTAINER.push(Migration001B as MigrationClassType);

    container.get = jest.fn((MigrationClass) => {
      if (MigrationClass === Migration001A) return instanceA;
      if (MigrationClass === Migration001B) return instanceB;
      throw new Error("Unexpected migration class");
    }) as typeof container.get;

    const migrations = getMigrations();

    expect(migrations).toHaveLength(2);
    // Both should have same version
    expect(migrations[0]?.getVersion()).toBe("001");
    expect(migrations[1]?.getVersion()).toBe("001");
  });

  test("should return array of correct type", () => {
    class Migration001 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    const instance = new Migration001();
    MIGRATIONS_CONTAINER.push(Migration001 as MigrationClassType);
    container.get = jest.fn().mockReturnValue(instance);

    const migrations = getMigrations();

    expect(Array.isArray(migrations)).toBe(true);
  });

  test("should not modify original MIGRATIONS_CONTAINER order", () => {
    class Migration003 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "003";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    class Migration001 implements IMigration {
      async up(): Promise<void> {}
      async down(): Promise<void> {}
      getVersion(): string {
        return "001";
      }
      getDependencies(): MigrationClassType[] {
        return [];
      }
    }

    MIGRATIONS_CONTAINER.push(Migration003 as MigrationClassType);
    MIGRATIONS_CONTAINER.push(Migration001 as MigrationClassType);

    const originalOrder = [...MIGRATIONS_CONTAINER];

    container.get = jest.fn((MigrationClass) => {
      if (MigrationClass === Migration001) return new Migration001();
      if (MigrationClass === Migration003) return new Migration003();
      throw new Error("Unexpected migration class");
    }) as typeof container.get;

    getMigrations();

    // Original container should remain unchanged
    expect(MIGRATIONS_CONTAINER).toEqual(originalOrder);
  });

  test("should handle large number of migrations", () => {
    const migrations: MigrationClassType[] = [];
    const instances: IMigration[] = [];

    // Create 100 migrations
    for (let i = 1; i <= 100; i++) {
      const version = i.toString().padStart(3, "0");
      class DynamicMigration implements IMigration {
        async up(): Promise<void> {}
        async down(): Promise<void> {}
        getVersion(): string {
          return version;
        }
        getDependencies(): MigrationClassType[] {
          return [];
        }
      }

      const instance = new DynamicMigration();
      migrations.push(DynamicMigration as unknown as MigrationClassType);
      instances.push(instance);
      MIGRATIONS_CONTAINER.push(DynamicMigration as unknown as MigrationClassType);
    }

    let callCount = 0;
    container.get = jest.fn(() => {
      const instance = instances[callCount++];
      if (!instance) throw new Error("No instance available");
      return instance;
    }) as typeof container.get;

    const result = getMigrations();

    expect(result).toHaveLength(100);
    expect(container.get).toHaveBeenCalledTimes(100);

    // Verify sorted order
    for (let i = 0; i < 99; i++) {
      const currentVersion = Number(result[i]?.getVersion());
      const nextVersion = Number(result[i + 1]?.getVersion());
      expect(currentVersion).toBeLessThanOrEqual(nextVersion);
    }
  });
});
