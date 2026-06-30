import * as lancedb from "@lancedb/lancedb";
import type { Filter } from "./types.ts";
import { buildFilter } from "./utils.ts";

export class VectorTable<DataType extends { metadata: Record<string, unknown> }> {
  private table: lancedb.Table;
  private reranker: Awaited<ReturnType<typeof lancedb.rerankers.RRFReranker.create>> | null = null;

  constructor(table: lancedb.Table) {
    this.table = table;
  }

  public async add(data: ({ id: string; text: string } & DataType)[]): Promise<this> {
    await this.table.add(data);

    return this;
  }

  public async findById(
    id: string,
    options?: {
      select?: (keyof DataType["metadata"] | "id" | "text")[];
    },
  ): Promise<({ id: string } & DataType) | null> {
    const { select } = options ?? {};
    const escaped = id.replace(/'/g, "''");

    let query = this.table.query().where(`id = '${escaped}'`).limit(1);

    if (select) {
      const cols = [
        ...new Set([
          "id",
          ...select.map((f) => {
            const s = String(f);
            return s === "id" || s === "text" ? s : `metadata.${s}`;
          }),
        ]),
      ];
      query = query.select(cols);
    }

    const results = await query.toArray();

    return (results[0] as { id: string } & DataType) ?? null;
  }

  public async findBy(
    filter: { [K in keyof DataType["metadata"]]?: DataType["metadata"][K] | undefined },
    options?: {
      limit?: number;
      select?: (keyof DataType["metadata"] | "id" | "text")[];
    },
  ): Promise<({ id: string } & DataType)[]> {
    const { limit = 10, select } = options ?? {};

    const conditions = Object.entries(filter)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        const col = `metadata.${key}`;
        return typeof value === "string" ? `${col} = '${value.replace(/'/g, "''")}'` : `${col} = ${value}`;
      });

    let query = this.table.query().where(conditions.join(" AND ")).limit(limit);

    if (select) {
      const cols = [
        ...new Set([
          "id",
          ...select.map((f) => {
            const s = String(f);
            return s === "id" || s === "text" ? s : `metadata.${s}`;
          }),
        ]),
      ];
      query = query.select(cols);
    }

    return query.toArray() as Promise<({ id: string } & DataType)[]>;
  }

  public async findOneBy(
    filter: { [K in keyof DataType["metadata"]]?: DataType["metadata"][K] | undefined },
    options?: {
      select?: (keyof DataType["metadata"] | "id" | "text")[];
    },
  ): Promise<({ id: string } & DataType) | null> {
    const results = await this.findBy(filter, { ...options, limit: 1 });

    return results[0] ?? null;
  }

  // Create a scalar index (btree, bitmap, or labelList) on a column used in filters.
  public async createIndex(
    column: string,
    options?: {
      config?: ReturnType<typeof lancedb.Index.btree | typeof lancedb.Index.bitmap | typeof lancedb.Index.labelList>;
    },
  ): Promise<this> {
    await this.table.createIndex(column, options);

    return this;
  }

  // Create an IVF PQ vector index for approximate nearest neighbor search.
  public async createVectorIndex(
    column = "vector",
    options?: Partial<Parameters<lancedb.Table["createIndex"]>[1] & object>,
  ): Promise<this> {
    await this.table.createIndex(column, {
      config: lancedb.Index.ivfPq(),
      ...options,
    });

    return this;
  }

  public async search(
    query: string,
    options?: {
      limit?: number;
      select?: (keyof DataType["metadata"] | "id" | "text")[];
      filter?: Filter<DataType>;
      // Number of IVF partitions to search. Higher values improve recall but reduce speed.
      nprobes?: number;
      // Multiplier for additional candidate rows during IVF PQ refine step to improve recall accuracy.
      refineFactor?: number;
      // Skip un-indexed data for faster queries when indices are up to date.
      fastSearch?: boolean;
    },
  ): Promise<({ id: string } & DataType)[]> {
    const { limit = 10, select, filter, nprobes, refineFactor, fastSearch = true } = options ?? {};

    if (!this.reranker) {
      this.reranker = await lancedb.rerankers.RRFReranker.create();
    }

    let vectorQuery = (this.table.search(query, "hybrid", "text") as lancedb.VectorQuery)
      .rerank(this.reranker)
      .limit(limit);

    if (nprobes) {
      vectorQuery = vectorQuery.nprobes(nprobes);
    }

    if (refineFactor) {
      vectorQuery = vectorQuery.refineFactor(refineFactor);
    }

    if (fastSearch) {
      vectorQuery = vectorQuery.fastSearch();
    }

    if (select) {
      const cols = [
        ...new Set([
          "id",
          ...select.map((f) => {
            const s = String(f);
            return s === "id" || s === "text" ? s : `metadata.${s}`;
          }),
        ]),
      ];
      vectorQuery = vectorQuery.select(cols);
    }

    if (filter) {
      vectorQuery = vectorQuery.where(buildFilter(filter));
    }

    return vectorQuery.toArray();
  }

  // Print the resolved query plan to identify slow queries and missing indices.
  public async explainPlan(
    query: string,
    options?: {
      limit?: number;
      filter?: Filter<DataType>;
      verbose?: boolean;
    },
  ): Promise<string> {
    const { limit = 10, filter, verbose = true } = options ?? {};

    if (!this.reranker) {
      this.reranker = await lancedb.rerankers.RRFReranker.create();
    }

    let vectorQuery = (this.table.search(query, "hybrid", "text") as lancedb.VectorQuery)
      .rerank(this.reranker)
      .limit(limit);

    if (filter) {
      vectorQuery = vectorQuery.where(buildFilter(filter));
    }

    return vectorQuery.explainPlan(verbose);
  }

  // Execute the query and return a physical plan annotated with runtime metrics.
  public async analyzePlan(
    query: string,
    options?: {
      limit?: number;
      filter?: Filter<DataType>;
    },
  ): Promise<string> {
    const { limit = 10, filter } = options ?? {};

    if (!this.reranker) {
      this.reranker = await lancedb.rerankers.RRFReranker.create();
    }

    let vectorQuery = (this.table.search(query, "hybrid", "text") as lancedb.VectorQuery)
      .rerank(this.reranker)
      .limit(limit);

    if (filter) {
      vectorQuery = vectorQuery.where(buildFilter(filter));
    }

    return vectorQuery.analyzePlan();
  }
}
