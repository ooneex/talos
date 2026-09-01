import { EmbeddingFunction, register } from "@lancedb/lancedb/embedding";
import { AppEnv } from "@talosjs/app-env";
import { Float32 } from "apache-arrow";
import OpenAI from "openai";
import type { OpenrouterEmbeddingOptionsType, OpenrouterModelType } from "./types.ts";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Maps each supported model to the OpenRouter provider slug it is served under and its embedding size.
const MODEL_CONFIG: Record<OpenrouterModelType, { provider: string; ndims: number }> = {
  "text-embedding-ada-002": { provider: "openai", ndims: 1536 },
  "text-embedding-3-small": { provider: "openai", ndims: 1536 },
  "text-embedding-3-large": { provider: "openai", ndims: 3072 },
  "qwen3-embedding-8b": { provider: "qwen", ndims: 4096 },
};

@register("openrouter")
export class OpenrouterEmbeddingFunction extends EmbeddingFunction<string, Partial<OpenrouterEmbeddingOptionsType>> {
  private readonly client: OpenAI;
  private readonly model: OpenrouterModelType;

  public constructor(
    optionsRaw: Partial<OpenrouterEmbeddingOptionsType> = { model: "qwen3-embedding-8b" },
    env: AppEnv = new AppEnv(),
  ) {
    super();

    const options = this.resolveVariables(optionsRaw);
    const apiKey = options.apiKey ?? env.OPENROUTER_API_KEY;
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
    const config = MODEL_CONFIG[this.model];
    if (!config) {
      throw new Error(`Unknown model: ${this.model}`);
    }

    return config.ndims;
  }

  public override embeddingDataType(): Float32 {
    return new Float32();
  }

  public override async computeSourceEmbeddings(data: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({ model: this.getRoutedModel(), input: data });

    return response.data.map((embedding) => embedding.embedding);
  }

  public override async computeQueryEmbeddings(data: string): Promise<number[]> {
    const response = await this.client.embeddings.create({ model: this.getRoutedModel(), input: data });
    const [embedding] = response.data;
    if (!embedding) {
      throw new Error("OpenRouter returned no embedding for the query");
    }

    return embedding.embedding;
  }

  private getRoutedModel(): string {
    const config = MODEL_CONFIG[this.model];
    if (!config) {
      throw new Error(`Unknown model: ${this.model}`);
    }

    return `${config.provider}/${this.model}`;
  }
}
