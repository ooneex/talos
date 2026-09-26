import { Environment } from "@talosjs/app-env";
export { Environment };

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type SeedClassType = new (...args: any[]) => ISeed;

export interface ISeed {
  run: <T = unknown>(data?: unknown[]) => Promise<T> | T;
  isActive: () => Promise<boolean> | boolean;
  getDependencies: () => Promise<SeedClassType[]> | SeedClassType[];
  getEnv: () => Promise<Environment[]> | Environment[];
}

/** The application database a seed run closes when it finishes, such as `MainDatabase`. */
export interface ISeedDatabase {
  close: () => Promise<void>;
}

export type SeedRunConfigType = {
  database: ISeedDatabase;
  cacheDir?: string;
};
