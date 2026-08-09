import type { Connection } from "@lancedb/lancedb";
import type { EmbeddingFunction } from "@lancedb/lancedb/embedding";
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
import type { VectorTable } from "./VectorTable.ts";

export type ConvertorOptionsType = {
  /** Directory where converted files (JSON, Markdown, extracted images) are written. */
  outputDir?: string;
  /** Password used to unlock encrypted PDF sources before conversion. */
  password?: string;
  /** File format used when extracting images from the source document. */
  imageFormat?: "png" | "jpeg";
  /** Page selection to convert (e.g. "1,3-5"); when omitted, the whole document is processed. */
  pages?: string;
  /** Suppress progress and informational output from the underlying converter. */
  quiet?: boolean;
};

export type ChunkType = {
  text: string;
  metadata: {
    heading: string | null;
    page: number | null;
    pages: number[];
    source: string | null;
  };
};

export type ConvertorFileType = { name: string; path: string };

export type ConvertorType = {
  convert: (
    options?: ConvertorOptionsType,
  ) => AsyncGenerator<ChunkType, { json: ConvertorFileType; markdown: ConvertorFileType }>;
};

export interface IVectorDatabase<DataType extends { metadata: Record<string, unknown> }> {
  getDatabaseUri: () => string;
  connect: () => Promise<void>;
  getDatabase: () => Connection;
  getEmbeddingModel: () => EmbeddingModelType;
  getSchema: () => { [K in keyof DataType]: FieldValueType };
  open: (name: string, options?: { mode?: "create" | "overwrite" }) => Promise<VectorTable<DataType>>;
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
export type VectorDatabaseClassType = new (...args: any[]) => IVectorDatabase<any>;

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
