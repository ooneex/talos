import type { EnvironmentNameType } from "@talosjs/app-env";
import type { IHeader } from "@talosjs/http-header";
import type { StatusCodeType } from "@talosjs/http-status";

export type StreamBodyType = ReadableStream | AsyncIterable<Uint8Array | string>;

export type StreamConfigType = {
  status?: StatusCodeType;
  contentType?: string;
};

// Server-side streaming: push chunks over time. The producer receives a writer
// and may run for as long as it likes; `signal` is aborted when the client disconnects.
export type StreamWriterType = {
  write: (chunk: Uint8Array | string) => Promise<void>;
  close: () => void;
  readonly signal: AbortSignal;
};

export type StreamProducerType = (writer: StreamWriterType) => void | Promise<void>;

// Server-Sent Events: a single SSE message (`data:`, with optional `event:`, `id:`, `retry:`).
// Object/array `data` is JSON-encoded; multi-line strings are split into multiple `data:` lines.
export type SseMessageType = {
  data: string | number | boolean | Record<string, unknown> | unknown[];
  event?: string;
  id?: string;
  retry?: number;
};

export type SseWriterType = {
  send: (message: SseMessageType | string) => Promise<void>;
  comment: (text: string) => Promise<void>;
  close: () => void;
  readonly signal: AbortSignal;
};

export type SseProducerType = (writer: SseWriterType) => void | Promise<void>;

export type SseConfigType = {
  status?: StatusCodeType;
};

export interface IResponse<DataType extends Record<string, unknown> = Record<string, unknown>> {
  readonly header: IHeader;
  done: boolean; // For socket
  json: (data: DataType, status?: StatusCodeType) => IResponse<DataType>;
  stream: (body: StreamBodyType | StreamProducerType, config?: StreamConfigType) => IResponse<DataType>;
  sse: (producer: SseProducerType, config?: SseConfigType) => IResponse<DataType>;
  exception: (
    message: string,
    config?: {
      key?: string;
      data?: DataType;
      status?: StatusCodeType;
    },
  ) => IResponse<DataType>;
  notFound: (
    message: string,
    config?: {
      key?: string;
      data?: DataType;
      status?: StatusCodeType;
    },
  ) => IResponse<DataType>;
  redirect: (url: string | URL, status?: StatusCodeType) => IResponse<DataType>;
  get: (env?: EnvironmentNameType) => Response;
  getData: () => DataType | null;
  getStatus: () => StatusCodeType;
  isStream: () => boolean;
}

export type ResponseDataType<Data extends Record<string, unknown>> = {
  key: string | null;
  data: Data;
  message: string | null;
  success: boolean;
  done: boolean; // For socket
  status: number;
  isClientError: boolean;
  isServerError: boolean;
  isNotFound: boolean;
  isUnauthorized: boolean;
  isForbidden: boolean;
  app: {
    env: EnvironmentNameType;
  };
};
