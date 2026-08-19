import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import { AbstractRedisDatabase } from "./AbstractRedisDatabase";
import type { IRedisDatabase, RedisConnectionOptionsType } from "./types";

@injectable()
export class RedisDatabase extends AbstractRedisDatabase implements IRedisDatabase {
  constructor(@inject(AppEnv) env: AppEnv, options: RedisConnectionOptionsType = {}) {
    super(options.url || env.DATABASE_REDIS_URL || "", options, {
      label: "Redis",
      envKey: "DATABASE_REDIS_URL",
    });
  }
}
