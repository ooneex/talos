import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import { AbstractRedisDatabase } from "./AbstractRedisDatabase";
import type { DragonflyConnectionOptionsType, IDragonflyDatabase } from "./types";

@injectable()
export class DragonflyDatabase extends AbstractRedisDatabase implements IDragonflyDatabase {
  constructor(@inject(AppEnv) env: AppEnv, options: DragonflyConnectionOptionsType = {}) {
    // Dragonfly speaks RESP, so the Bun Redis client drives it as-is
    super(options.url || env.DATABASE_DRAGONFLY_URL || "", options, {
      label: "Dragonfly",
      envKey: "DATABASE_DRAGONFLY_URL",
    });
  }
}
