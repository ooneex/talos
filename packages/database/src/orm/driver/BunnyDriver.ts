import type { Client, Config } from "@libsql/client";
import { createClient } from "@libsql/client/web";
import type { BunnyDataSourceOptionsType, DatabaseTypeType } from "../../types";
import { TursoDriver } from "./TursoDriver";

export const bunnyConfig = (options: BunnyDataSourceOptionsType): Config => ({
  ...options.extra,
  url: options.url,
  ...(options.authToken !== undefined && { authToken: options.authToken }),
  ...(options.concurrency !== undefined && { concurrency: options.concurrency }),
  ...(options.intMode !== undefined && { intMode: options.intMode }),
});

/** Bunny Database driver: libSQL over HTTP/WebSocket through the `@libsql/client/web` client, with the SQLite dialect. */
export class BunnyDriver extends TursoDriver {
  public override readonly type: DatabaseTypeType = "bunny";

  public override createClient(): Client {
    return createClient(bunnyConfig(this.options as BunnyDataSourceOptionsType));
  }
}
