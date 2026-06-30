import { Utf8 } from "apache-arrow";
import { AbstractVectorDatabase } from "./AbstractVectorDatabase.ts";
import type { EmbeddingModelType, EmbeddingProviderType, FieldValueType } from "./types.ts";

type DataType = {
  metadata: Record<string, unknown>;
};

export class VectorDatabase extends AbstractVectorDatabase<DataType> {
  public getDatabaseUri(): string {
    return "";
  }

  public getEmbeddingModel(): { provider: EmbeddingProviderType; model: EmbeddingModelType["model"] } {
    return { provider: "openai", model: "text-embedding-ada-002" };
  }

  public getSchema(): { [K in keyof DataType]: FieldValueType } {
    return {
      metadata: new Utf8(),
    };
  }
}
