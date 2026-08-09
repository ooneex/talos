import * as lancedb from "@lancedb/lancedb";
import type { EmbeddingFunction } from "@lancedb/lancedb/embedding";
import { getRegistry, LanceSchema } from "@lancedb/lancedb/embedding";
import { Utf8 } from "apache-arrow";
import "./OpenAIEmbeddingFunction.ts";
import "./QwenEmbeddingFunction.ts";
import type { EmbeddingModelType, FieldValueType, IVectorDatabase } from "./types.ts";
import { VectorDatabaseException } from "./VectorDatabaseException.ts";
import { VectorTable } from "./VectorTable.ts";

export abstract class AbstractVectorDatabase<DataType extends { metadata: Record<string, unknown> }>
  implements IVectorDatabase<DataType>
{
  private db: lancedb.Connection | null = null;
  private readonly embeddingModel: EmbeddingModelType;
  private readonly embedding: EmbeddingFunction;

  // Both the "openai" and "qwen" providers are registered above (both served through OpenRouter), so subclasses can pick either.
  protected constructor(embeddingModel: EmbeddingModelType) {
    this.embeddingModel = embeddingModel;
    this.embedding = getRegistry()
      .get(embeddingModel.provider)
      ?.create({ model: embeddingModel.model }) as EmbeddingFunction;
  }

  public abstract getDatabaseUri(): string;
  public abstract getSchema(): { [K in keyof DataType]: FieldValueType };

  public getEmbeddingModel(): EmbeddingModelType {
    return this.embeddingModel;
  }

  public async connect(): Promise<void> {
    this.db = await lancedb.connect(this.getDatabaseUri());
  }

  public getDatabase(): lancedb.Connection {
    if (!this.db) {
      throw new VectorDatabaseException("Database not connected. Call connect() first.", "VECTOR_DB_NOT_CONNECTED");
    }

    return this.db;
  }

  public async open(name: string, options?: { mode?: "create" | "overwrite" }): Promise<VectorTable<DataType>> {
    const tableNames = await this.getDatabase().tableNames();
    if (tableNames.includes(name)) {
      const table = await this.getDatabase().openTable(name);
      return new VectorTable<DataType>(table);
    }

    const schema = LanceSchema({
      id: new Utf8(),
      text: this.embedding.sourceField(new Utf8()),
      vector: this.embedding.vectorField(),
      ...this.getSchema(),
    });
    const table = await this.getDatabase().createEmptyTable(name, schema, { mode: "overwrite", ...options });
    await table.createIndex("id", { config: lancedb.Index.btree() });
    await table.createIndex("text", { config: lancedb.Index.fts() });
    await table.createIndex("vector", { config: lancedb.Index.ivfPq() });

    return new VectorTable<DataType>(table);
  }
}
