import type { CloudflareVectorizeClient } from "./CloudflareVectorizeClient.ts";
import type {
  CloudflareVectorizeMetadataIndexType,
  CloudflareVectorizeMutationType,
  CloudflareVectorizeQueryOptionsType,
  CloudflareVectorizeQueryResultType,
  CloudflareVectorizeVectorType,
  CloudflareVectorRecordType,
  ITextEmbeddingFunction,
} from "./types.ts";
import { VectorDatabaseException } from "./VectorDatabaseException.ts";

const TEXT_METADATA_KEY = "_talosText";

export class CloudflareVectorTable<DataType extends { metadata: Record<string, unknown> }> {
  private readonly client: CloudflareVectorizeClient;
  private readonly embedding: ITextEmbeddingFunction;
  private readonly name: string;

  public constructor(name: string, client: CloudflareVectorizeClient, embedding: ITextEmbeddingFunction) {
    this.name = name;
    this.client = client;
    this.embedding = embedding;
  }

  public async add(
    data: ({ id: string; text: string; namespace?: string } & DataType)[],
  ): Promise<CloudflareVectorizeMutationType> {
    return this.write(data, "insert");
  }

  public async upsert(
    data: ({ id: string; text: string; namespace?: string } & DataType)[],
  ): Promise<CloudflareVectorizeMutationType> {
    return this.write(data, "upsert");
  }

  public async findById(id: string): Promise<CloudflareVectorRecordType<DataType> | null> {
    const [vector] = await this.client.getByIds(this.name, [id]);

    return vector ? this.toRecord(vector) : null;
  }

  public async getByIds(ids: string[]): Promise<CloudflareVectorRecordType<DataType>[]> {
    const vectors = await this.client.getByIds(this.name, ids);

    return vectors.map((vector) => this.toRecord(vector));
  }

  public deleteByIds(ids: string[]): Promise<CloudflareVectorizeMutationType> {
    return this.client.deleteByIds(this.name, ids);
  }

  public createMetadataIndex(
    propertyName: keyof DataType["metadata"] & string,
    indexType: CloudflareVectorizeMetadataIndexType,
  ): Promise<CloudflareVectorizeMutationType> {
    return this.client.createMetadataIndex(this.name, propertyName, indexType);
  }

  public async search(
    query: string,
    options: CloudflareVectorizeQueryOptionsType = {},
  ): Promise<CloudflareVectorRecordType<DataType>[]> {
    const vector = await this.embedding.computeQueryEmbeddings(query);
    const result = await this.query(vector, options);

    return result.matches.map((match) => this.toRecord(match));
  }

  public query(
    vector: number[],
    options: CloudflareVectorizeQueryOptionsType = {},
  ): Promise<CloudflareVectorizeQueryResultType> {
    return this.client.query(this.name, vector, { returnMetadata: "all", ...options });
  }

  private async write(
    data: ({ id: string; text: string; namespace?: string } & DataType)[],
    operation: "insert" | "upsert",
  ): Promise<CloudflareVectorizeMutationType> {
    if (data.length === 0) {
      throw new VectorDatabaseException("At least one vector is required", "VECTOR_DB_EMPTY_WRITE");
    }

    const embeddings = await this.embedding.computeSourceEmbeddings(data.map((item) => item.text));
    if (embeddings.length !== data.length) {
      throw new VectorDatabaseException(
        "Embedding response count does not match the number of source records",
        "VECTOR_DB_EMBEDDING_COUNT_MISMATCH",
      );
    }

    const vectors = data.map(
      (item, index): CloudflareVectorizeVectorType => ({
        id: item.id,
        values: embeddings[index] ?? [],
        ...(item.namespace ? { namespace: item.namespace } : {}),
        metadata: { ...item.metadata, [TEXT_METADATA_KEY]: item.text },
      }),
    );

    return operation === "insert" ? this.client.insert(this.name, vectors) : this.client.upsert(this.name, vectors);
  }

  private toRecord(vector: {
    id: string;
    metadata?: Record<string, unknown>;
    namespace?: string;
    score?: number;
    values?: number[];
  }): CloudflareVectorRecordType<DataType> {
    const metadata = { ...(vector.metadata ?? {}) };
    const text = metadata[TEXT_METADATA_KEY];
    delete metadata[TEXT_METADATA_KEY];

    return {
      id: vector.id,
      text: typeof text === "string" ? text : "",
      metadata: metadata as DataType["metadata"],
      ...(vector.namespace ? { namespace: vector.namespace } : {}),
      ...(vector.score === undefined ? {} : { score: vector.score }),
      ...(vector.values === undefined ? {} : { values: vector.values }),
    };
  }
}
