import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { DatabaseException } from "./DatabaseException";
import { DataSource } from "./orm/DataSource";
import { SqlDatabase } from "./SqlDatabase";

/**
 * A SQLite data source at `SQLITE_DATABASE_PATH` (or the path given to `getSource()`), managing every
 * decorated entity.
 *
 * @example
 * const database = new SqliteDatabase(new AppEnv());
 * const users = await database.open(UserEntity, ":memory:");
 */
export class SqliteDatabase extends SqlDatabase {
  public constructor(@inject(AppEnv) private readonly env: AppEnv) {
    super();
  }

  public getSource(database?: string): DataSource {
    if (this.source) {
      return this.source;
    }

    const path = database || this.env.SQLITE_DATABASE_PATH;

    if (!path) {
      throw new DatabaseException(
        "SQLite database path is required. Please provide a database path either through the constructor options or set the SQLITE_DATABASE_PATH environment variable.",
        "CONNECTION_FAILED",
      );
    }

    this.source = new DataSource({
      type: "sqlite",
      database: path,
      synchronize: false,
      enableWAL: true,
      timeout: 30_000,
    });

    return this.source;
  }
}
