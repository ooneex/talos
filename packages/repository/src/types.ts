import type { FilterResultType } from "@talosjs/types";

/**
 * A repository class the container can build. `TCriteria` is the filter its `find` takes on top of
 * `page`, `limit` and `q`, so a repository whose `find` requires a field (an owner id, say) still fits.
 */
// biome-ignore lint/suspicious/noExplicitAny: trust me
export type RepositoryClassType<TCriteria = unknown> = new (...args: any[]) => IRepository<unknown, TCriteria>;

export interface IRepository<T = unknown, TCriteria = unknown> {
  open: () => Promise<unknown>;
  close: () => Promise<void>;
  find: (criteria: TCriteria & { page?: number; limit?: number; q?: string }) => Promise<FilterResultType<T>>;
}
