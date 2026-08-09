import { EmbeddingFunction, register } from "@lancedb/lancedb/embedding";
import { Float32 } from "apache-arrow";
import OpenAI from "openai";
import type { QwenEmbeddingOptionsType, QwenModelType } from "./types.ts";

// Qwen3 embedding models are served through OpenRouter's OpenAI-compatible API.
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

@register("qwen")
export class QwenEmbeddingFunction extends EmbeddingFunction<string, Partial<QwenEmbeddingOptionsType>> {
  private readonly client: OpenAI;
  private readonly model: QwenModelType;

  public constructor(optionsRaw: Partial<QwenEmbeddingOptionsType> = { model: "qwen3-embedding-8b" }) {
    super();

    const options = this.resolveVariables(optionsRaw);
    const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OpenRouter API key is required");
    }

    this.client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
    this.model = options.model ?? "qwen3-embedding-8b";
  }

  protected override getSensitiveKeys(): string[] {
    return ["apiKey"];
  }

  public override ndims(): number {
    switch (this.model) {
      case "qwen3-embedding-8b":
        return 4096;
      default:
        throw new Error(`Unknown model: ${this.model}`);
    }
  }

  public override embeddingDataType(): Float32 {
    return new Float32();
  }

  public override async computeSourceEmbeddings(data: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({ model: `qwen/${this.model}`, input: data });

    return response.data.map((embedding) => embedding.embedding);
  }

  public override async computeQueryEmbeddings(data: string): Promise<number[]> {
    const response = await this.client.embeddings.create({ model: `qwen/${this.model}`, input: data });
    const [embedding] = response.data;
    if (!embedding) {
      throw new Error("OpenRouter returned no embedding for the query");
    }

    return embedding.embedding;
  }
}
