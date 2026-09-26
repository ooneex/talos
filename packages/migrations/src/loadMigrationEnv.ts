import { dirname, join } from "node:path";
import { loadEnv } from "@talosjs/app-env";

/**
 * The app env file a migration script should load.
 *
 * Scripts live at `modules/<name>/bin/migration/{up,down}.ts`, so the shared env is three
 * levels up under `app/`. Any other entry point — the app, a test — leaves this unset.
 */
export const migrationEnvFile = (main: string): string | undefined => {
  if (!main.endsWith("/bin/migration/up.ts") && !main.endsWith("/bin/migration/down.ts")) {
    return undefined;
  }

  return join(dirname(main), "../../../app/.env.yml");
};

/** Loads the app env before a migration script resolves its database from the container. */
export const loadMigrationEnv = async (main: string = Bun.main): Promise<void> => {
  const file = migrationEnvFile(main);

  if (!file) {
    return;
  }

  await loadEnv([file]);
};

await loadMigrationEnv();
