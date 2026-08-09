import { EmbeddingFunction, register } from "@lancedb/lancedb/embedding";
import { Float32 } from "apache-arrow";
import OpenAI from "openai";
import type { OpenAIEmbeddingOptionsType, OpenAIModelType } from "./types.ts";

// OpenAI embedding models are served through OpenRouter's OpenAI-compatible API.
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

@register("openai")
export class OpenAIEmbeddingFunction extends EmbeddingFunction<string, Partial<OpenAIEmbeddingOptionsType>> {
  private readonly client: OpenAI;
  private readonly model: OpenAIModelType;

  public constructor(optionsRaw: Partial<OpenAIEmbeddingOptionsType> = { model: "text-embedding-3-large" }) {
    super();

    const options = this.resolveVariables(optionsRaw);
    const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OpenRouter API key is required");
    }

    this.client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
    this.model = options.model ?? "text-embedding-3-large";
  }

  protected override getSensitiveKeys(): string[] {
    return ["apiKey"];
  }

  public override ndims(): number {
    switch (this.model) {
      case "text-embedding-ada-002":
        return 1536;
      case "text-embedding-3-large":
        return 3072;
      case "text-embedding-3-small":
        return 1536;
      default:
        throw new Error(`Unknown model: ${this.model}`);
    }
  }

  public override embeddingDataType(): Float32 {
    return new Float32();
  }

  public override async computeSourceEmbeddings(data: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({ model: `openai/${this.model}`, input: data });

    return response.data.map((embedding) => embedding.embedding);
  }

  public override async computeQueryEmbeddings(data: string): Promise<number[]> {
    const response = await this.client.embeddings.create({ model: `openai/${this.model}`, input: data });
    const [embedding] = response.data;
    if (!embedding) {
      throw new Error("OpenRouter returned no embedding for the query");
    }

    return embedding.embedding;
  }
}
