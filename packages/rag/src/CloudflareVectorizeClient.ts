import type {
  CloudflareVectorizeIndexType,
  CloudflareVectorizeMetadataIndexType,
  CloudflareVectorizeMetricType,
  CloudflareVectorizeMutationType,
  CloudflareVectorizeQueryOptionsType,
  CloudflareVectorizeQueryResultType,
  CloudflareVectorizeVectorType,
} from "./types.ts";
import { VectorDatabaseException } from "./VectorDatabaseException.ts";

const DEFAULT_API_URL = "https://api.cloudflare.com/client/v4";

type CloudflareResponseInfoType = {
  code: number;
  message: string;
};

type CloudflareApiResponseType<ResultType> = {
  errors: CloudflareResponseInfoType[];
  messages: CloudflareResponseInfoType[];
  result: ResultType;
  success: boolean;
};

export class CloudflareVectorizeClient {
  private readonly accountUrl: string;
  private readonly apiToken: string;
  private readonly fetch: typeof globalThis.fetch;

  public constructor(options: {
    accountId: string;
    apiToken: string;
    apiUrl?: string;
    fetch?: typeof globalThis.fetch;
  }) {
    if (!options.accountId) {
      throw new VectorDatabaseException("Cloudflare account ID is required", "VECTOR_DB_CONFIG_REQUIRED");
    }
    if (!options.apiToken) {
      throw new VectorDatabaseException("Cloudflare API token is required", "VECTOR_DB_CONFIG_REQUIRED");
    }

    const apiUrl = (options.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    this.accountUrl = `${apiUrl}/accounts/${encodeURIComponent(options.accountId)}/vectorize/v2/indexes`;
    this.apiToken = options.apiToken;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  public getUri(): string {
    return this.accountUrl;
  }

  public listIndexes(): Promise<CloudflareVectorizeIndexType[]> {
    return this.request<CloudflareVectorizeIndexType[]>("");
  }

  public createIndex(options: {
    name: string;
    dimensions: number;
    metric: CloudflareVectorizeMetricType;
    description?: string;
  }): Promise<CloudflareVectorizeIndexType> {
    return this.request<CloudflareVectorizeIndexType>("", {
      method: "POST",
      body: JSON.stringify({
        name: options.name,
        ...(options.description ? { description: options.description } : {}),
        config: { dimensions: options.dimensions, metric: options.metric },
      }),
      headers: { "Content-Type": "application/json" },
    });
  }

  public deleteIndex(name: string): Promise<unknown> {
    return this.request<unknown>(`/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  public insert(indexName: string, vectors: CloudflareVectorizeVectorType[]): Promise<CloudflareVectorizeMutationType> {
    return this.writeVectors(indexName, "insert", vectors);
  }

  public upsert(indexName: string, vectors: CloudflareVectorizeVectorType[]): Promise<CloudflareVectorizeMutationType> {
    return this.writeVectors(indexName, "upsert", vectors);
  }

  public getByIds(indexName: string, ids: string[]): Promise<CloudflareVectorizeVectorType[]> {
    return this.request<CloudflareVectorizeVectorType[]>(`/${encodeURIComponent(indexName)}/get_by_ids`, {
      method: "POST",
      body: JSON.stringify({ ids }),
      headers: { "Content-Type": "application/json" },
    });
  }

  public deleteByIds(indexName: string, ids: string[]): Promise<CloudflareVectorizeMutationType> {
    return this.request<CloudflareVectorizeMutationType>(`/${encodeURIComponent(indexName)}/delete_by_ids`, {
      method: "POST",
      body: JSON.stringify({ ids }),
      headers: { "Content-Type": "application/json" },
    });
  }

  public query(
    indexName: string,
    vector: number[],
    options: CloudflareVectorizeQueryOptionsType = {},
  ): Promise<CloudflareVectorizeQueryResultType> {
    return this.request<CloudflareVectorizeQueryResultType>(`/${encodeURIComponent(indexName)}/query`, {
      method: "POST",
      body: JSON.stringify({ vector, ...options }),
      headers: { "Content-Type": "application/json" },
    });
  }

  public createMetadataIndex(
    indexName: string,
    propertyName: string,
    indexType: CloudflareVectorizeMetadataIndexType,
  ): Promise<CloudflareVectorizeMutationType> {
    return this.request<CloudflareVectorizeMutationType>(`/${encodeURIComponent(indexName)}/metadata_index/create`, {
      method: "POST",
      body: JSON.stringify({ propertyName, indexType }),
      headers: { "Content-Type": "application/json" },
    });
  }

  private writeVectors(
    indexName: string,
    operation: "insert" | "upsert",
    vectors: CloudflareVectorizeVectorType[],
  ): Promise<CloudflareVectorizeMutationType> {
    const body = vectors.map((vector) => JSON.stringify(vector)).join("\n");

    return this.request<CloudflareVectorizeMutationType>(`/${encodeURIComponent(indexName)}/${operation}`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  private async request<ResultType>(path: string, init: RequestInit = {}): Promise<ResultType> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${this.apiToken}`);

    let response: Response;
    try {
      response = await this.fetch(`${this.accountUrl}${path}`, { ...init, headers });
    } catch (error) {
      throw new VectorDatabaseException("Cloudflare Vectorize request failed", "VECTOR_DB_REQUEST_FAILED", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    let payload: CloudflareApiResponseType<ResultType>;
    try {
      payload = (await response.json()) as CloudflareApiResponseType<ResultType>;
    } catch {
      throw new VectorDatabaseException(
        "Cloudflare Vectorize returned an invalid response",
        "VECTOR_DB_INVALID_RESPONSE",
        {
          status: response.status,
        },
      );
    }

    if (!response.ok || !payload.success) {
      const errors = Array.isArray(payload.errors) ? payload.errors : [];
      const message = errors.map((error) => error.message).join(", ") || response.statusText || "Unknown error";
      throw new VectorDatabaseException(`Cloudflare Vectorize request failed: ${message}`, "VECTOR_DB_REQUEST_FAILED", {
        status: response.status,
        errors,
      });
    }

    return payload.result;
  }
}
