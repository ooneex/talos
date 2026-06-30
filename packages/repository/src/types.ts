import type { FilterResultType } from "@talosjs/types";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type RepositoryClassType = new (...args: any[]) => IRepository;

export interface IRepository<T = unknown, TCriteria = unknown> {
  open: () => Promise<unknown>;
  close: () => Promise<void>;
  find: (criteria: TCriteria & { page?: number; limit?: number; q?: string }) => Promise<FilterResultType<T>>;
}
