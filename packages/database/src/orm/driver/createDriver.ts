import type { DataSourceOptionsType } from "../../types";
import { MissingDriverError } from "../errors";
import type { IDriver } from "./AbstractDriver";
import { ClickHouseDriver } from "./ClickHouseDriver";
import { CloudflareDriver } from "./CloudflareDriver";
import { MongoDriver } from "./MongoDriver";
import { MysqlDriver } from "./MysqlDriver";
import { PostgresDriver } from "./PostgresDriver";
import { RedisDriver } from "./RedisDriver";
import { SqliteDriver } from "./SqliteDriver";

/** The database driver matching `options.type`. */
export const createDriver = (options: DataSourceOptionsType): IDriver => {
  switch (options.type) {
    case "clickhouse":
      return new ClickHouseDriver(options);
    case "cloudflare":
      return new CloudflareDriver(options);
    case "postgres":
      return new PostgresDriver(options);
    case "redis":
      return new RedisDriver(options);
    case "mongodb":
      return new MongoDriver(options);
    case "mysql":
    case "mariadb":
      return new MysqlDriver(options);
    case "sqlite":
      return new SqliteDriver(options);
    default:
      throw new MissingDriverError(String((options as { type?: unknown }).type));
  }
};
