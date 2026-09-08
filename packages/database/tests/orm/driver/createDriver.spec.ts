import { describe, expect, test } from "bun:test";
import type { DataSourceOptionsType, ICloudflareDatabase } from "../../../src";
import { ClickHouseDriver } from "../../../src/orm/driver/ClickHouseDriver";
import { CloudflareDriver } from "../../../src/orm/driver/CloudflareDriver";
import { createDriver } from "../../../src/orm/driver/createDriver";
import { MongoDriver } from "../../../src/orm/driver/MongoDriver";
import { MysqlDriver } from "../../../src/orm/driver/MysqlDriver";
import { PostgresDriver } from "../../../src/orm/driver/PostgresDriver";
import { RedisDriver } from "../../../src/orm/driver/RedisDriver";
import { SqliteDriver } from "../../../src/orm/driver/SqliteDriver";
import { TursoDriver } from "../../../src/orm/driver/TursoDriver";
import { MissingDriverError } from "../../../src/orm/errors";

describe("createDriver", () => {
  test("should pick the dialect from the data source type", () => {
    const options: DataSourceOptionsType = { type: "sqlite", database: ":memory:" };

    expect(createDriver({ type: "postgres" })).toBeInstanceOf(PostgresDriver);
    expect(createDriver({ type: "mysql" })).toBeInstanceOf(MysqlDriver);
    expect(createDriver({ type: "mariadb" })).toBeInstanceOf(MysqlDriver);
    expect(createDriver({ type: "mariadb" }).type).toBe("mariadb");
    expect(createDriver({ type: "clickhouse" })).toBeInstanceOf(ClickHouseDriver);
    expect(createDriver({ type: "cloudflare", client: {} as ICloudflareDatabase })).toBeInstanceOf(CloudflareDriver);
    expect(createDriver({ type: "redis" })).toBeInstanceOf(RedisDriver);
    expect(createDriver({ type: "mongodb" })).toBeInstanceOf(MongoDriver);
    expect(createDriver({ type: "turso", url: ":memory:" })).toBeInstanceOf(TursoDriver);
    expect(createDriver(options)).toBeInstanceOf(SqliteDriver);
    expect(createDriver(options).options).toBe(options);
  });

  test("should reject unknown types", () => {
    expect(() => createDriver({ type: "oracle" } as unknown as DataSourceOptionsType)).toThrow(MissingDriverError);
    expect(() => createDriver({ type: "oracle" } as unknown as DataSourceOptionsType)).toThrow(
      'Wrong driver: "oracle" given',
    );
  });
});
