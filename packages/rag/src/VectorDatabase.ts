import { Utf8 } from "apache-arrow";
import { AbstractVectorDatabase } from "./AbstractVectorDatabase.ts";
import type { EmbeddingModelType, FieldValueType } from "./types.ts";

type DataType = {
  metadata: Record<string, unknown>;
};

const DEFAULT_EMBEDDING_MODEL: EmbeddingModelType = { provider: "qwen", model: "qwen3-embedding-8b" };

export class VectorDatabase extends AbstractVectorDatabase<DataType> {
  // Defaults to qwen (via OpenRouter); pass an openai model to use OpenAI's embeddings instead.
  public constructor(embeddingModel: EmbeddingModelType = DEFAULT_EMBEDDING_MODEL) {
    super(embeddingModel);
  }

  public getDatabaseUri(): string {
    return "";
  }

  public getSchema(): { [K in keyof DataType]: FieldValueType } {
    return {
      metadata: new Utf8(),
    };
  }
}
