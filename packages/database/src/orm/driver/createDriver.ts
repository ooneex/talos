import type { DataSourceOptionsType } from "../../types";
import { MissingDriverError } from "../errors";
import type { IDriver } from "./AbstractDriver";
import { ClickHouseDriver } from "./ClickHouseDriver";
import { MysqlDriver } from "./MysqlDriver";
import { PostgresDriver } from "./PostgresDriver";
import { SqliteDriver } from "./SqliteDriver";

/** The dialect matching `options.type`. */
export const createDriver = (options: DataSourceOptionsType): IDriver => {
  switch (options.type) {
    case "clickhouse":
      return new ClickHouseDriver(options);
    case "postgres":
      return new PostgresDriver(options);
    case "mysql":
    case "mariadb":
      return new MysqlDriver(options);
    case "sqlite":
      return new SqliteDriver(options);
    default:
      throw new MissingDriverError(String((options as { type?: unknown }).type));
  }
};
