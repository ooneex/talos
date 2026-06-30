import { Environment, type EnvironmentNameType } from "@talosjs/app-env";
import { Header, type IHeader } from "@talosjs/http-header";
import { HttpStatus, type StatusCodeType } from "@talosjs/http-status";
import type {
  IResponse,
  ResponseDataType,
  SseConfigType,
  SseMessageType,
  SseProducerType,
  SseWriterType,
  StreamBodyType,
  StreamConfigType,
  StreamProducerType,
  StreamWriterType,
} from "./types";

const httpStatus = new HttpStatus();

const encoder = new TextEncoder();

const formatSseMessage = (message: SseMessageType | string): string => {
  const normalized = typeof message === "string" ? { data: message } : message;
  let frame = "";

  if (normalized.event) {
    frame += `event: ${normalized.event}\n`;
  }
  if (normalized.id) {
    frame += `id: ${normalized.id}\n`;
  }
  if (normalized.retry !== undefined) {
    frame += `retry: ${normalized.retry}\n`;
  }

  const data = typeof normalized.data === "string" ? normalized.data : JSON.stringify(normalized.data);
  for (const line of data.split("\n")) {
    frame += `data: ${line}\n`;
  }

  return `${frame}\n`;
};

// Wraps a push-based producer in a ReadableStream. The producer receives a writer
// built by `createWriter`; the stream closes when the producer resolves and aborts
// `signal` if the client disconnects (ReadableStream.cancel).
const createProducerStream = <Writer>(
  createWriter: (enqueue: (chunk: Uint8Array | string) => void, close: () => void, signal: AbortSignal) => Writer,
  producer: (writer: Writer) => void | Promise<void>,
): ReadableStream<Uint8Array> => {
  const abortController = new AbortController();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const enqueue = (chunk: Uint8Array | string): void => {
        if (closed) {
          return;
        }
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      };
      const close = (): void => {
        if (closed) {
          return;
        }
        closed = true;
        controller.close();
      };

      try {
        await producer(createWriter(enqueue, close, abortController.signal));
        close();
      } catch (error) {
        if (!closed) {
          closed = true;
          controller.error(error);
        }
      }
    },
    cancel: () => {
      closed = true;
      abortController.abort();
    },
  });
};

export class HttpResponse<Data extends Record<string, unknown> = Record<string, unknown>> implements IResponse<Data> {
  public readonly header: IHeader;
  private key: string | null = null;
  private data: Data | null = null;
  private status: StatusCodeType = HttpStatus.Code.OK;
  private redirectUrl: string | URL | null = null;
  private message: string | null = null;
  private streamBody: StreamBodyType | null = null;
  public done = false; // For socket

  constructor(header?: IHeader) {
    this.header = header || new Header();
  }

  public json(data: Data, status: StatusCodeType = HttpStatus.Code.OK): IResponse<Data> {
    this.key = null;
    this.data = data;
    this.status = status;
    this.header.remove("Content-Type");
    this.header.setJson();
    this.header.remove("Location");
    this.redirectUrl = null;
    this.message = null;
    this.streamBody = null;

    return this;
  }

  public stream(body: StreamBodyType | StreamProducerType, config?: StreamConfigType): IResponse<Data> {
    this.streamBody =
      typeof body === "function"
        ? createProducerStream<StreamWriterType>(
            (enqueue, close, signal) => ({
              write: async (chunk) => enqueue(chunk),
              close,
              signal,
            }),
            body,
          )
        : body;
    this.status = config?.status ?? HttpStatus.Code.OK;
    this.key = null;
    this.data = null;
    this.message = null;
    this.redirectUrl = null;
    this.header.remove("Location");
    this.header.set("Content-Type", config?.contentType ?? "application/octet-stream");

    return this;
  }

  public sse(producer: SseProducerType, config?: SseConfigType): IResponse<Data> {
    this.streamBody = createProducerStream<SseWriterType>(
      (enqueue, close, signal) => ({
        send: async (message) => enqueue(formatSseMessage(message)),
        comment: async (text) => enqueue(`: ${text}\n\n`),
        close,
        signal,
      }),
      producer,
    );
    this.status = config?.status ?? HttpStatus.Code.OK;
    this.key = null;
    this.data = null;
    this.message = null;
    this.redirectUrl = null;
    this.header.remove("Location");
    this.header.set("Content-Type", "text/event-stream");
    this.header.set("Cache-Control", "no-cache");
    this.header.set("Connection", "keep-alive");

    return this;
  }

  public exception(
    message: string,
    config?: {
      key?: string;
      data?: Data;
      status?: StatusCodeType;
    },
  ): IResponse<Data> {
    this.key = config?.key || null;
    this.message = message;
    this.status = config?.status ?? HttpStatus.Code.InternalServerError;
    this.data = config?.data || null;
    this.redirectUrl = null;
    this.streamBody = null;
    this.header.remove("Content-Type");
    this.header.setJson();
    this.header.remove("Location");

    return this;
  }

  public notFound(
    message: string,
    config?: {
      key?: string;
      data?: Data;
      status?: StatusCodeType;
    },
  ): IResponse<Data> {
    this.key = config?.key || "NOT_FOUND";
    this.message = message;
    this.status = config?.status || HttpStatus.Code.NotFound;
    this.data = config?.data || null;
    this.redirectUrl = null;
    this.streamBody = null;
    this.header.remove("Content-Type");
    this.header.setJson();
    this.header.remove("Location");

    return this;
  }

  public redirect(url: string | URL, status: StatusCodeType = HttpStatus.Code.Found): IResponse<Data> {
    this.key = null;
    this.redirectUrl = url;
    this.status = status;
    this.header.remove("Content-Type");
    this.header.setLocation(url.toString());
    this.data = null;
    this.message = null;
    this.streamBody = null;

    return this;
  }

  public getData(): Data | null {
    return this.data;
  }

  public getStatus(): StatusCodeType {
    return this.status;
  }

  public isStream(): boolean {
    return this.streamBody !== null;
  }

  public get(env?: EnvironmentNameType): Response {
    if (this.streamBody) {
      return new Response(this.streamBody as BodyInit, {
        status: this.status,
        headers: this.header.native,
      });
    }

    if (this.redirectUrl) {
      return new Response(null, {
        status: this.status,
        headers: this.header.native,
      });
    }

    const responseData: ResponseDataType<Data> = {
      key: this.key || null,
      data: this.data || ({} as Data),
      message: this.message,
      success: httpStatus.isSuccessful(this.status),
      done: this.done,
      status: this.status,
      isClientError: httpStatus.isClientError(this.status),
      isServerError: httpStatus.isServerError(this.status),
      isNotFound: false,
      isUnauthorized: false,
      isForbidden: false,
      app: {
        env: env || Environment.PRODUCTION,
      },
    };

    return new Response(JSON.stringify(responseData), {
      status: responseData.status,
      headers: this.header.native,
    });
  }
}
