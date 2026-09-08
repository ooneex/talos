import type { Connection } from "@lancedb/lancedb";
import type { EmbeddingFunction } from "@lancedb/lancedb/embedding";
import type { PDFExtractOptionsType, PDFExtractResultType } from "@talosjs/pdf";
import type {
  Binary,
  Bool,
  DateDay,
  DateMillisecond,
  Decimal,
  Float16,
  Float32,
  Float64,
  Int8,
  Int16,
  Int32,
  Int64,
  LargeBinary,
  LargeUtf8,
  Null,
  Uint8,
  Uint16,
  Uint32,
  Uint64,
  Utf8,
} from "apache-arrow";
import type { CloudflareVectorizeClient } from "./CloudflareVectorizeClient.ts";
import type { CloudflareVectorTable } from "./CloudflareVectorTable.ts";
import type { VectorTable } from "./VectorTable.ts";

export type RAGOptionsType = {
  /** OpenRouter API key used to OCR scanned pages; defaults to `OPENROUTER_API_KEY`. */
  apiKey?: string;
};

export type RAGOcrPageType = {
  /** 1-indexed page number that was OCR'd. */
  page: number;
  /** Markdown transcribed from the page image. */
  markdown: string;
};

export type RAGExtractResultType = PDFExtractResultType & {
  /** OCR results for pages that needed image-based extraction, in ascending page order. */
  ocrPages: RAGOcrPageType[];
};

export interface IRAG {
  extract: (options?: PDFExtractOptionsType) => Promise<RAGExtractResultType>;
}

export interface IVectorDatabase<DataType extends { metadata: Record<string, unknown> }> {
  getDatabaseUri: () => string;
  connect: () => Promise<void>;
  getDatabase: () => Connection;
  getEmbeddingModel: () => EmbeddingModelType;
  getSchema: () => { [K in keyof DataType]: FieldValueType };
  open: (name: string, options?: { mode?: "create" | "overwrite" }) => Promise<VectorTable<DataType>>;
}

export interface ICloudflareVectorDatabase<DataType extends { metadata: Record<string, unknown> }> {
  getDatabaseUri: () => string;
  connect: () => Promise<void>;
  getDatabase: () => CloudflareVectorizeClient;
  getEmbeddingModel: () => EmbeddingModelType;
  listIndexes: () => Promise<CloudflareVectorizeIndexType[]>;
  open: (name: string, options?: CloudflareVectorDatabaseOpenOptionsType) => Promise<CloudflareVectorTable<DataType>>;
  deleteIndex: (name: string) => Promise<unknown>;
}

export type OpenAIModelType = "text-embedding-ada-002" | "text-embedding-3-small" | "text-embedding-3-large";

export type QwenModelType = "qwen3-embedding-8b";

export type OpenrouterModelType = OpenAIModelType | QwenModelType;

export type OpenrouterEmbeddingOptionsType = {
  apiKey: string;
  model: OpenrouterModelType;
};

export type EmbeddingModelType = {
  model: OpenrouterModelType;
};

export type CloudflareVectorizeMetricType = "cosine" | "euclidean" | "dot-product";

export type CloudflareVectorizeMetadataIndexType = "string" | "number" | "boolean";

export type CloudflareVectorizeFilterValueType = string | number | boolean | null;

export type CloudflareVectorizeFilterOperatorType = {
  $eq?: CloudflareVectorizeFilterValueType;
  $ne?: CloudflareVectorizeFilterValueType;
  $in?: CloudflareVectorizeFilterValueType[];
  $nin?: CloudflareVectorizeFilterValueType[];
  $lt?: string | number;
  $lte?: string | number;
  $gt?: string | number;
  $gte?: string | number;
};

export type CloudflareVectorizeFilterType = Record<
  string,
  CloudflareVectorizeFilterValueType | CloudflareVectorizeFilterOperatorType
>;

export type CloudflareVectorizeIndexType = {
  config?: {
    dimensions: number;
    metric: CloudflareVectorizeMetricType;
  };
  created_on?: string;
  description?: string;
  modified_on?: string;
  name?: string;
};

export type CloudflareVectorizeVectorType = {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
  namespace?: string;
};

export type CloudflareVectorizeMatchType = {
  id: string;
  metadata?: Record<string, unknown>;
  namespace?: string;
  score?: number;
  values?: number[];
};

export type CloudflareVectorizeMutationType = {
  mutationId?: string;
};

export type CloudflareVectorizeQueryOptionsType = {
  filter?: CloudflareVectorizeFilterType;
  returnMetadata?: "none" | "indexed" | "all";
  returnValues?: boolean;
  topK?: number;
};

export type CloudflareVectorizeQueryResultType = {
  count: number;
  matches: CloudflareVectorizeMatchType[];
};

export interface ITextEmbeddingFunction {
  ndims: () => number;
  computeSourceEmbeddings: (data: string[]) => Promise<number[][]>;
  computeQueryEmbeddings: (data: string) => Promise<number[]>;
}

export type CloudflareVectorDatabaseOptionsType = {
  accountId: string;
  apiToken: string;
  apiUrl?: string;
  embeddingApiKey?: string;
  embeddingFunction?: ITextEmbeddingFunction;
  embeddingModel?: EmbeddingModelType;
  fetch?: typeof globalThis.fetch;
};

export type CloudflareVectorDatabaseOpenOptionsType = {
  description?: string;
  metric?: CloudflareVectorizeMetricType;
};

export type CloudflareVectorRecordType<DataType extends { metadata: Record<string, unknown> }> = {
  id: string;
  text: string;
  metadata: DataType["metadata"];
  namespace?: string;
  score?: number;
  values?: number[];
};

export type FieldValueType =
  | Null
  | Bool
  | Int8
  | Int16
  | Int32
  | Int64
  | Uint8
  | Uint16
  | Uint32
  | Uint64
  | Float16
  | Float32
  | Float64
  | Utf8
  | LargeUtf8
  | Binary
  | LargeBinary
  | Decimal
  | DateDay
  | DateMillisecond
  | EmbeddingFunction;

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type VectorDatabaseClassType = new (...args: any[]) => IVectorDatabase<any> | ICloudflareVectorDatabase<any>;

export type FilterFieldType<T extends { metadata: Record<string, unknown> }> = keyof T["metadata"] | "id" | "text";

export type FilterConditionType<T extends { metadata: Record<string, unknown> }> =
  | { field: FilterFieldType<T>; op: ">" | ">=" | "<" | "<=" | "="; value: string | number }
  | { field: FilterFieldType<T>; op: "IN"; value: (string | number)[] }
  | { field: FilterFieldType<T>; op: "LIKE" | "NOT LIKE"; value: string }
  | { field: FilterFieldType<T>; op: "IS NULL" | "IS NOT NULL"; value?: never }
  | { field: FilterFieldType<T>; op: "IS TRUE" | "IS NOT TRUE" | "IS FALSE" | "IS NOT FALSE"; value?: never };

export type FilterType<T extends { metadata: Record<string, unknown> }> =
  | FilterConditionType<T>
  | { AND: FilterType<T>[] }
  | { OR: FilterType<T>[] }
  | { NOT: FilterType<T> };
