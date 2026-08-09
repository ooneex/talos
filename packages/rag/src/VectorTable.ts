import * as lancedb from "@lancedb/lancedb";
import type { FilterFieldType, FilterType } from "./types.ts";
import { buildFilter, toColumnName } from "./utils.ts";

export class VectorTable<DataType extends { metadata: Record<string, unknown> }> {
  private readonly table: lancedb.Table;
  private reranker: Awaited<ReturnType<typeof lancedb.rerankers.RRFReranker.create>> | null = null;

  public constructor(table: lancedb.Table) {
    this.table = table;
  }

  // Always keep "id" selected, and namespace every other field under "metadata" unless it's "text".
  private buildSelectColumns(select: FilterFieldType<DataType>[]): string[] {
    return [...new Set(["id", ...select.map((field) => toColumnName(String(field)))])];
  }

  private async getReranker(): Promise<Awaited<ReturnType<typeof lancedb.rerankers.RRFReranker.create>>> {
    this.reranker ??= await lancedb.rerankers.RRFReranker.create();

    return this.reranker;
  }

  // Start a reranked hybrid (full-text + vector) search query for the given text and result limit.
  private async startHybridQuery(query: string, limit: number): Promise<lancedb.VectorQuery> {
    const reranker = await this.getReranker();

    return (this.table.search(query, "hybrid", "text") as lancedb.VectorQuery).rerank(reranker).limit(limit);
  }

  public async add(data: ({ id: string; text: string } & DataType)[]): Promise<this> {
    await this.table.add(data);

    return this;
  }

  public async findById(
    id: string,
    options?: {
      select?: FilterFieldType<DataType>[];
    },
  ): Promise<({ id: string } & DataType) | null> {
    const { select } = options ?? {};
    const escaped = id.replace(/'/g, "''");

    let query = this.table.query().where(`id = '${escaped}'`).limit(1);

    if (select) {
      query = query.select(this.buildSelectColumns(select));
    }

    const results = await query.toArray();

    return (results[0] as { id: string } & DataType) ?? null;
  }

  public async findBy(
    filter: { [K in keyof DataType["metadata"]]?: DataType["metadata"][K] | undefined },
    options?: {
      limit?: number;
      select?: FilterFieldType<DataType>[];
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
      query = query.select(this.buildSelectColumns(select));
    }

    return query.toArray() as Promise<({ id: string } & DataType)[]>;
  }

  public async findOneBy(
    filter: { [K in keyof DataType["metadata"]]?: DataType["metadata"][K] | undefined },
    options?: {
      select?: FilterFieldType<DataType>[];
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
      select?: FilterFieldType<DataType>[];
      filter?: FilterType<DataType>;
      // Number of IVF partitions to search. Higher values improve recall but reduce speed.
      nprobes?: number;
      // Multiplier for additional candidate rows during IVF PQ refine step to improve recall accuracy.
      refineFactor?: number;
      // Skip un-indexed data for faster queries when indices are up to date.
      fastSearch?: boolean;
    },
  ): Promise<({ id: string } & DataType)[]> {
    const { limit = 10, select, filter, nprobes, refineFactor, fastSearch = true } = options ?? {};

    let vectorQuery = await this.startHybridQuery(query, limit);

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
      vectorQuery = vectorQuery.select(this.buildSelectColumns(select));
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
      filter?: FilterType<DataType>;
      verbose?: boolean;
    },
  ): Promise<string> {
    const { limit = 10, filter, verbose = true } = options ?? {};

    let vectorQuery = await this.startHybridQuery(query, limit);

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
      filter?: FilterType<DataType>;
    },
  ): Promise<string> {
    const { limit = 10, filter } = options ?? {};

    let vectorQuery = await this.startHybridQuery(query, limit);

    if (filter) {
      vectorQuery = vectorQuery.where(buildFilter(filter));
    }

    return vectorQuery.analyzePlan();
  }
}
