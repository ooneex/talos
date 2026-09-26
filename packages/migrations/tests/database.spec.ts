import { describe, expect, test } from "bun:test";
import type { DataSource, PostgresDataSourceOptionsType, SqliteDataSourceOptionsType } from "@talosjs/database";
import type { SQL } from "bun";
import { databaseIdentity, migrationSource, openMigrationDatabase } from "@/database";
import type { IMigrationDatabase, IMigrationDataSource } from "@/types";

type FakeSourceType = IMigrationDataSource & {
  destroyed: boolean;
  closedWith: number | undefined;
  initializeCount: number;
};

const createSource = (options: IMigrationDataSource["options"], initialized = false): FakeSourceType => {
  const source: FakeSourceType = {
    options,
    isInitialized: initialized,
    destroyed: false,
    closedWith: undefined,
    initializeCount: 0,
    client: {
      close: async (closeOptions?: { timeout?: number }) => {
        source.closedWith = closeOptions?.timeout;
      },
    } as SQL,
    initialize: async () => {
      source.initializeCount += 1;
      source.isInitialized = true;
    },
    destroy: async () => {
      source.destroyed = true;
      source.isInitialized = false;
    },
  };

  return source;
};

describe("databaseIdentity", () => {
  test("should use the connection URL when the source has one", () => {
    expect(databaseIdentity(createSource({ type: "postgres", url: "postgres://localhost/talos" }))).toBe(
      "postgres://localhost/talos",
    );
  });

  test("should prefer the URL over a database name", () => {
    expect(
      databaseIdentity(createSource({ type: "postgres", url: "postgres://localhost/talos", database: "talos" })),
    ).toBe("postgres://localhost/talos");
  });

  test("should combine the dialect and database name when there is no URL", () => {
    expect(databaseIdentity(createSource({ type: "sqlite", database: "var/databases/library.db" }))).toBe(
      "sqlite:var/databases/library.db",
    );
  });

  test("should fall back to the dialect when the source names neither a URL nor a database", () => {
    expect(databaseIdentity(createSource({ type: "postgres", url: "", database: "" }))).toBe("postgres");
  });
});

describe("migrationSource", () => {
  test("should open the default source when no connection name is given", () => {
    const source = createSource({ type: "postgres", url: "postgres://localhost/talos" });
    const database: IMigrationDatabase = {
      getSource: (name?: string) => {
        expect(name).toBeUndefined();

        return source;
      },
    };

    expect(migrationSource(database)).toBe(source);
  });

  test("should forward a connection name to getSource", () => {
    const source = createSource({ type: "sqlite", database: "/tmp/library.db" });
    let seen: string | undefined;
    const database: IMigrationDatabase = {
      getSource: (name?: string) => {
        seen = name;

        return source;
      },
    };

    expect(migrationSource(database, "/tmp/library.db")).toBe(source);
    expect(seen).toBe("/tmp/library.db");
  });
});

describe("openMigrationDatabase", () => {
  test("should initialize a source that is not connected yet", async () => {
    const source = createSource({ type: "postgres", url: "postgres://localhost/talos" });

    const connection = await openMigrationDatabase(source);

    expect(source.initializeCount).toBe(1);
    expect(source.isInitialized).toBe(true);
    expect(connection.sql).toBe(source.client);
  });

  test("should reuse a source that is already connected", async () => {
    const source = createSource({ type: "postgres", url: "postgres://localhost/talos" }, true);

    await openMigrationDatabase(source);

    expect(source.initializeCount).toBe(0);
  });

  test("should destroy the source when the run closes it", async () => {
    const source = createSource({ type: "postgres", url: "postgres://localhost/talos" }, true);
    const connection = await openMigrationDatabase(source);

    await connection.close();

    expect(source.destroyed).toBe(true);
    expect(source.closedWith).toBeUndefined();
  });

  test("should force-close a failed run without waiting for the pool", async () => {
    const source = createSource({ type: "postgres", url: "postgres://localhost/talos" }, true);
    const connection = await openMigrationDatabase(source);

    await connection.close(0);

    expect(source.closedWith).toBe(0);
    expect(source.destroyed).toBe(false);
    expect(source.isInitialized).toBe(false);
  });

  test("should ignore a second close after the source is already shut", async () => {
    const source = createSource({ type: "postgres", url: "postgres://localhost/talos" }, true);
    const connection = await openMigrationDatabase(source);

    await connection.close();
    await connection.close();

    expect(source.destroyed).toBe(true);
  });
});

class PostgresDatabase {
  public getSource(): DataSource<PostgresDataSourceOptionsType> {
    throw new Error("unused");
  }
}

class SqliteDatabase {
  public getSource(database?: string): DataSource<SqliteDataSourceOptionsType> {
    throw new Error(database ?? "unused");
  }
}

describe("IMigrationDatabase", () => {
  test("should accept a postgres data source", () => {
    const database: IMigrationDatabase = new PostgresDatabase();

    expect(typeof database.getSource).toBe("function");
  });

  test("should accept a sqlite data source", () => {
    const database: IMigrationDatabase = new SqliteDatabase();

    expect(typeof database.getSource).toBe("function");
  });
});
