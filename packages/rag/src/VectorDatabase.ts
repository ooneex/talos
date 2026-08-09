import { Utf8 } from "apache-arrow";
import { AbstractVectorDatabase } from "./AbstractVectorDatabase.ts";
import type { EmbeddingModelType, EmbeddingProviderType, FieldValueType } from "./types.ts";

type DataType = {
  metadata: Record<string, unknown>;
};

export class VectorDatabase extends AbstractVectorDatabase<DataType> {
  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor is required for Bun function coverage
  public constructor() {
    super();
  }

  public getDatabaseUri(): string {
    return "";
  }

  public getEmbeddingModel(): { provider: EmbeddingProviderType; model: EmbeddingModelType["model"] } {
    return { provider: "qwen", model: "qwen3-embedding-8b" };
  }

  public getSchema(): { [K in keyof DataType]: FieldValueType } {
    return {
      metadata: new Utf8(),
    };
  }
}
