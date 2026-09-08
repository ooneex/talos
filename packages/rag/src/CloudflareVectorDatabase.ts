import { CloudflareVectorizeClient } from "./CloudflareVectorizeClient.ts";
import { CloudflareVectorTable } from "./CloudflareVectorTable.ts";
import { OpenrouterEmbeddingFunction } from "./OpenrouterEmbeddingFunction.ts";
import type {
  CloudflareVectorDatabaseOpenOptionsType,
  CloudflareVectorDatabaseOptionsType,
  CloudflareVectorizeIndexType,
  EmbeddingModelType,
  ICloudflareVectorDatabase,
  ITextEmbeddingFunction,
} from "./types.ts";
import { VectorDatabaseException } from "./VectorDatabaseException.ts";

const DEFAULT_EMBEDDING_MODEL: EmbeddingModelType = { model: "text-embedding-3-small" };
const MAX_VECTORIZE_DIMENSIONS = 1536;

export class CloudflareVectorDatabase<DataType extends { metadata: Record<string, unknown> }>
  implements ICloudflareVectorDatabase<DataType>
{
  private readonly client: CloudflareVectorizeClient;
  private readonly embedding: ITextEmbeddingFunction;
  private readonly embeddingModel: EmbeddingModelType;
  private connected = false;

  public constructor(options: CloudflareVectorDatabaseOptionsType) {
    this.embeddingModel = options.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    this.embedding =
      options.embeddingFunction ??
      new OpenrouterEmbeddingFunction({
        model: this.embeddingModel.model,
        ...(options.embeddingApiKey ? { apiKey: options.embeddingApiKey } : {}),
      });
    this.client = new CloudflareVectorizeClient(options);

    if (this.embedding.ndims() > MAX_VECTORIZE_DIMENSIONS) {
      throw new VectorDatabaseException(
        `Cloudflare Vectorize supports at most ${MAX_VECTORIZE_DIMENSIONS} dimensions`,
        "VECTOR_DB_DIMENSIONS_UNSUPPORTED",
        { dimensions: this.embedding.ndims() },
      );
    }
  }

  public getDatabaseUri(): string {
    return this.client.getUri();
  }

  public getEmbeddingModel(): EmbeddingModelType {
    return this.embeddingModel;
  }

  public async connect(): Promise<void> {
    await this.client.listIndexes();
    this.connected = true;
  }

  public getDatabase(): CloudflareVectorizeClient {
    if (!this.connected) {
      throw new VectorDatabaseException("Database not connected. Call connect() first.", "VECTOR_DB_NOT_CONNECTED");
    }

    return this.client;
  }

  public listIndexes(): Promise<CloudflareVectorizeIndexType[]> {
    return this.getDatabase().listIndexes();
  }

  public async open(
    name: string,
    options: CloudflareVectorDatabaseOpenOptionsType = {},
  ): Promise<CloudflareVectorTable<DataType>> {
    const client = this.getDatabase();
    const indexes = await client.listIndexes();
    const index = indexes.find((candidate) => candidate.name === name);
    const dimensions = this.embedding.ndims();

    if (index?.config && index.config.dimensions !== dimensions) {
      throw new VectorDatabaseException(
        `Cloudflare Vectorize index "${name}" has ${index.config.dimensions} dimensions; ${dimensions} are required`,
        "VECTOR_DB_DIMENSIONS_MISMATCH",
        { actual: index.config.dimensions, expected: dimensions, index: name },
      );
    }

    if (!index) {
      await client.createIndex({
        name,
        dimensions,
        metric: options.metric ?? "cosine",
        ...(options.description ? { description: options.description } : {}),
      });
    }

    return new CloudflareVectorTable<DataType>(name, client, this.embedding);
  }

  public deleteIndex(name: string): Promise<unknown> {
    return this.getDatabase().deleteIndex(name);
  }
}
