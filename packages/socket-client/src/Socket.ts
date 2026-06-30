import type { ResponseDataType } from "@talosjs/http-response";
import type { ISocket, RequestDataType } from "./types";

export class Socket<
  SendData extends RequestDataType = RequestDataType,
  Response extends Record<string, unknown> = Record<string, unknown>,
> implements ISocket<SendData, Response>
{
  private ws: WebSocket;
  private messageHandler?: (response: ResponseDataType<Response>) => void;
  private openHandler?: (event: Event) => void;
  private errorHandler?: (event: Event, response?: ResponseDataType<Response>) => void;
  private closeHandler?: (event: CloseEvent) => void;
  private queuedMessages: (string | Blob | BufferSource)[] = [];

  constructor(private readonly url: string) {
    const fullURL = this.buildURL(this.url);
    this.ws = new WebSocket(fullURL);
    this.setupEventHandlers();
  }

  public close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }

  public send(data: SendData): void {
    const text = JSON.stringify(data);
    this.sendRaw(text);
  }

  private sendRaw(payload: string | Blob | BufferSource): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      this.queuedMessages.push(payload);
    }
  }

  public onMessage(handler: (response: ResponseDataType<Response>) => void): void {
    this.messageHandler = handler;
  }

  public onOpen(handler: (event: Event) => void): void {
    this.openHandler = handler;
  }

  public onClose(handler: (event: CloseEvent) => void): void {
    this.closeHandler = handler;
  }

  public onError(handler: (event: Event, response?: ResponseDataType<Response>) => void): void {
    this.errorHandler = handler;
  }

  private buildURL(url: string): string {
    if (url.startsWith("http://")) {
      url = url.replace("http://", "ws://");
    } else if (url.startsWith("https://")) {
      url = url.replace("https://", "wss://");
    } else if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      url = `wss://${url}`;
    }

    return this.encodeBearerToken(url);
  }

  private encodeBearerToken(url: string): string {
    const parsed = new URL(url);
    const bearerToken = parsed.searchParams.get("bearerToken");
    if (!bearerToken) {
      return url;
    }
    parsed.searchParams.set("bearerToken", bearerToken);
    return parsed.toString();
  }

  private setupEventHandlers(): void {
    this.ws.onmessage = (event: MessageEvent) => {
      if (this.messageHandler) {
        const data = JSON.parse(event.data) as ResponseDataType<Response>;

        if (data.done) {
          this.ws.close();
        }

        if (data.success) {
          this.messageHandler(data);

          return;
        }

        if (this.errorHandler) {
          this.errorHandler(event, data);
        }
      }
    };

    this.ws.onopen = (event: Event) => {
      this.flushQueuedMessages();
      if (this.openHandler) {
        this.openHandler(event);
      }
    };

    this.ws.onerror = (event: Event) => {
      if (this.errorHandler) {
        this.errorHandler(event);
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      if (this.closeHandler) {
        this.closeHandler(event);
      }
    };
  }

  private flushQueuedMessages(): void {
    while (this.queuedMessages.length > 0) {
      const message = this.queuedMessages.shift();
      if (message !== undefined && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(message);
      }
    }
  }
}
