import { SharedModule } from "@module/shared/SharedModule";
import { DatabaseException, decorator, TypeormDatabase } from "@talosjs/database";
import { inject } from "@talosjs/container";
import { AppEnv } from "@talosjs/app-env";
import { DataSource } from "typeorm";

@decorator.database()
export class SharedDatabase extends TypeormDatabase {
  public constructor(@inject(AppEnv) private readonly env: AppEnv) {
    super();
  }

  public getSource(_database?: string): DataSource {
    if (this.source) {
      return this.source;
    }

    const url = this.env.DATABASE_URL;

    if (!url) {
      throw new DatabaseException(
        "Database URL is required. Please set the DATABASE_URL environment variable.",
        "CONNECTION_FAILED",
      );
    }

    this.source = new DataSource({
      type: "postgres",
      url,
      synchronize: false,
      entities: SharedModule.entities,
      poolSize: 10,
      extra: {
        max: 10,
        min: 2,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
        allowExitOnIdle: false,
        maxLifetimeSeconds: 1_800,
      },
      logging: ["error", "warn", "migration"],
      maxQueryExecutionTime: 1_000,
    });

    return this.source;
  }
}
