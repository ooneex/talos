import { dirname, join } from "node:path";
import { loadEnv } from "@talosjs/app-env";

/**
 * The app env file a seed script should load.
 *
 * Scripts live at `modules/<name>/bin/seed/run.ts`, so the shared env is three levels up under
 * `app/`. Any other entry point — the app, a test — leaves this unset.
 */
export const seedEnvFile = (main: string): string | undefined => {
  if (!main.endsWith("/bin/seed/run.ts")) {
    return undefined;
  }

  return join(dirname(main), "../../../app/.env.yml");
};

/** Loads the app env before a seed script resolves its database from the container. */
export const loadSeedEnv = async (main: string = Bun.main): Promise<void> => {
  const file = seedEnvFile(main);

  if (!file) {
    return;
  }

  // `talos seed:run --env` sets APP_ENV before this file loads. The yaml is the
  // rest of the config and must not put that choice back.
  const appEnv = Bun.env.APP_ENV;

  await loadEnv([file]);

  if (appEnv) {
    Bun.env.APP_ENV = appEnv;
  }
};

await loadSeedEnv();
