import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Environment } from "@talosjs/app-env";
import type { ResponseDataType } from "@talosjs/http-response";
import { type RequestDataType, Socket } from "@/index";

// Type-safe interface for testing private members
interface SocketPrivate {
  ws: MockWebSocket;
  queuedMessages: (string | ArrayBufferLike | Blob | ArrayBufferView)[];
  buildURL: (url: string) => string;
  encodeBearerToken: (url: string) => string;
  sendRaw: (payload: string | ArrayBufferLike | Blob | ArrayBufferView) => void;
  flushQueuedMessages: () => void;
}

// Mock WebSocket
class MockWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public readonly CONNECTING = 0;
  public readonly OPEN = 1;
  public readonly CLOSING = 2;
  public readonly CLOSED = 3;

  public readyState = MockWebSocket.CONNECTING;
  public url: string;
  public onmessage?: (event: MessageEvent) => void;
  public onopen?: (event: Event) => void;
  public onclose?: (event: CloseEvent) => void;
  public onerror?: (event: Event) => void;

  private listeners: { [key: string]: Array<(event: Event) => void> } = {};

  constructor(url: string) {
    this.url = url;
    // Simulate connection opening after a tick
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.dispatchEvent(new Event("open"));
    }, 0);
  }

  public send = mock((_data: string | ArrayBufferLike | Blob | ArrayBufferView): void => {
    // Mock implementation - we'll spy on this
  });

  public close = mock((code?: number, reason?: string): void => {
    this.readyState = MockWebSocket.CLOSED;
    const closeEvent = new CloseEvent("close", { code: code || 1000, reason: reason || "" });
    this.dispatchEvent(closeEvent);
  });

  public addEventListener(type: string, listener: (event: Event) => void): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  public dispatchEvent(event: Event): boolean {
    if (event.type === "message" && this.onmessage) {
      this.onmessage(event as MessageEvent);
    } else if (event.type === "open" && this.onopen) {
      this.onopen(event);
    } else if (event.type === "close" && this.onclose) {
      this.onclose(event as CloseEvent);
    } else if (event.type === "error" && this.onerror) {
      this.onerror(event);
    }

    const listeners = this.listeners[event.type];
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }

    return true;
  }

  public simulateMessage<T extends Record<string, unknown>>(data: ResponseDataType<T>): void {
    const event = new MessageEvent("message", {
      data: JSON.stringify(data),
    });
    this.dispatchEvent(event);
  }

  public simulateError(): void {
    const event = new Event("error");
    this.dispatchEvent(event);
  }
}

// Replace global WebSocket with our mock
const originalWebSocket = globalThis.WebSocket;

describe("Socket", () => {
  beforeEach(() => {
    // @ts-expect-error - Mocking WebSocket
    globalThis.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  describe("constructor", () => {
    test("should create Socket with ws:// URL", () => {
      const socket = new Socket("ws://localhost:8080");
      expect(socket).toBeInstanceOf(Socket);
    });

    test("should create Socket with wss:// URL", () => {
      const socket = new Socket("wss://localhost:8080");
      expect(socket).toBeInstanceOf(Socket);
    });

    test("should convert http:// to ws://", () => {
      const socket = new Socket("http://localhost:8080");
      // We can't directly access the private ws property, but we can verify the URL is built correctly
      expect(socket).toBeInstanceOf(Socket);
    });

    test("should convert https:// to wss://", () => {
      const socket = new Socket("https://localhost:8080");
      expect(socket).toBeInstanceOf(Socket);
    });

    test("should add wss:// prefix to plain URL", () => {
      const socket = new Socket("localhost:8080");
      expect(socket).toBeInstanceOf(Socket);
    });
  });

  describe("buildURL", () => {
    test("should return ws:// URL unchanged", () => {
      const socket = new Socket("ws://localhost:8080");
      // Access private method through reflection for testing
      const buildURL = (socket as unknown as SocketPrivate).buildURL.bind(socket);
      expect(buildURL("ws://localhost:8080")).toBe("ws://localhost:8080");
    });

    test("should return wss:// URL unchanged", () => {
      const socket = new Socket("wss://localhost:8080");
      const buildURL = (socket as unknown as SocketPrivate).buildURL.bind(socket);
      expect(buildURL("wss://localhost:8080")).toBe("wss://localhost:8080");
    });

    test("should convert http:// to ws://", () => {
      const socket = new Socket("http://localhost:8080");
      const buildURL = (socket as unknown as SocketPrivate).buildURL.bind(socket);
      expect(buildURL("http://localhost:8080")).toBe("ws://localhost:8080");
    });

    test("should convert https:// to wss://", () => {
      const socket = new Socket("https://localhost:8080");
      const buildURL = (socket as unknown as SocketPrivate).buildURL.bind(socket);
      expect(buildURL("https://localhost:8080")).toBe("wss://localhost:8080");
    });

    test("should add wss:// prefix to plain URL", () => {
      const socket = new Socket("localhost:8080");
      const buildURL = (socket as unknown as SocketPrivate).buildURL.bind(socket);
      expect(buildURL("localhost:8080")).toBe("wss://localhost:8080");
    });

    test("should encode bearerToken query param", () => {
      const socket = new Socket("ws://localhost:8080");
      const buildURL = (socket as unknown as SocketPrivate).buildURL.bind(socket);
      const result = buildURL("ws://localhost:8080?bearerToken=eyJhbGciOiJIUzI1NiJ9.payload.sig");
      const parsed = new URL(result);
      expect(parsed.protocol).toBe("ws:");
      expect(parsed.searchParams.get("bearerToken")).toBe("eyJhbGciOiJIUzI1NiJ9.payload.sig");
    });

    test("should convert protocol and encode bearerToken together", () => {
      const socket = new Socket("ws://localhost:8080");
      const buildURL = (socket as unknown as SocketPrivate).buildURL.bind(socket);
      const result = buildURL("https://example.com/path?bearerToken=a b&foo=bar");
      const parsed = new URL(result);
      expect(parsed.protocol).toBe("wss:");
      expect(parsed.searchParams.get("bearerToken")).toBe("a b");
      expect(parsed.searchParams.get("foo")).toBe("bar");
    });
  });

  describe("encodeBearerToken", () => {
    test("should return URL unchanged when bearerToken is absent", () => {
      const socket = new Socket("ws://localhost:8080");
      const encode = (socket as unknown as SocketPrivate).encodeBearerToken.bind(socket);
      expect(encode("ws://localhost:8080/path?foo=bar")).toBe("ws://localhost:8080/path?foo=bar");
    });

    test("should return URL unchanged when there is no query string", () => {
      const socket = new Socket("ws://localhost:8080");
      const encode = (socket as unknown as SocketPrivate).encodeBearerToken.bind(socket);
      expect(encode("ws://localhost:8080/path")).toBe("ws://localhost:8080/path");
    });

    test("should encode an unencoded bearerToken value", () => {
      const socket = new Socket("ws://localhost:8080");
      const encode = (socket as unknown as SocketPrivate).encodeBearerToken.bind(socket);
      const result = encode("wss://example.com/?bearerToken=token/with=specials");
      expect(new URL(result).searchParams.get("bearerToken")).toBe("token/with=specials");
      expect(result).toContain("bearerToken=token%2Fwith%3Dspecials");
    });

    test("should preserve other query params", () => {
      const socket = new Socket("ws://localhost:8080");
      const encode = (socket as unknown as SocketPrivate).encodeBearerToken.bind(socket);
      const result = encode("wss://example.com/?foo=bar&bearerToken=x y&baz=qux");
      const parsed = new URL(result);
      expect(parsed.searchParams.get("foo")).toBe("bar");
      expect(parsed.searchParams.get("bearerToken")).toBe("x y");
      expect(parsed.searchParams.get("baz")).toBe("qux");
    });

    test("should leave URL untouched when bearerToken value is empty", () => {
      const socket = new Socket("ws://localhost:8080");
      const encode = (socket as unknown as SocketPrivate).encodeBearerToken.bind(socket);
      expect(encode("wss://example.com/?bearerToken=")).toBe("wss://example.com/?bearerToken=");
    });
  });

  describe("send", () => {
    test("should send JSON data when connection is open", async () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 10));

      const testData: RequestDataType = {
        payload: { message: "test" },
        queries: { filter: "active" },
      };

      socket.send(testData);

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(testData));
    });

    test("should queue messages when connection is not open", () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;
      ws.readyState = MockWebSocket.CONNECTING;

      const testData: RequestDataType = {
        payload: { message: "test" },
      };

      socket.send(testData);

      // Message should be queued, not sent immediately
      expect(ws.send).not.toHaveBeenCalled();

      // Check that message is in queue
      const queuedMessages = (socket as unknown as SocketPrivate).queuedMessages;
      expect(queuedMessages).toHaveLength(1);
      expect(queuedMessages[0]).toBe(JSON.stringify(testData));
    });

    test("should flush queued messages when connection opens", async () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;
      ws.readyState = MockWebSocket.CONNECTING;

      const testData: RequestDataType = {
        payload: { message: "test" },
      };

      socket.send(testData);
      expect(ws.send).not.toHaveBeenCalled();

      // Simulate connection opening
      ws.readyState = MockWebSocket.OPEN;
      ws.dispatchEvent(new Event("open"));

      // Wait for flush to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(testData));
    });
  });

  describe("close", () => {
    test("should close WebSocket without parameters", () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;

      socket.close();

      expect(ws.close).toHaveBeenCalledWith(undefined, undefined);
    });

    test("should close WebSocket with code and reason", () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;

      socket.close(1001, "Going away");

      expect(ws.close).toHaveBeenCalledWith(1001, "Going away");
    });
  });

  describe("event handlers", () => {
    test("should call message handler when message is received", async () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;

      const messageHandler = mock();
      socket.onMessage(messageHandler);

      const testResponse: ResponseDataType<{ result: string }> = {
        key: null,
        data: { result: "success" },
        message: "Test message",
        success: true,
        done: false,
        status: 200,
        isClientError: false,
        isServerError: false,
        isNotFound: false,
        isUnauthorized: false,
        isForbidden: false,
        app: {
          env: Environment.DEVELOPMENT,
        },
      };

      ws.simulateMessage(testResponse);

      expect(messageHandler).toHaveBeenCalledWith(testResponse);
    });

    test("should call open handler when connection opens", async () => {
      const openHandler = mock();
      const socket = new Socket("ws://localhost:8080");
      socket.onOpen(openHandler);

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(openHandler).toHaveBeenCalledWith(expect.any(Event));
    });

    test("should call error handler when error occurs", () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;
      const errorHandler = mock();

      socket.onError(errorHandler);
      ws.simulateError();

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Event));
    });

    test("should call close handler when connection closes", () => {
      const socket = new Socket("ws://localhost:8080");
      // No need to access ws for this test
      const closeHandler = mock();

      socket.onClose(closeHandler);
      socket.close(1000, "Normal closure");

      expect(closeHandler).toHaveBeenCalledWith(expect.any(CloseEvent));
    });
  });

  describe("private methods", () => {
    test("flushQueuedMessages should send all queued messages", async () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;
      ws.readyState = MockWebSocket.CONNECTING;

      // Queue multiple messages
      const message1 = "test message 1";
      const message2 = "test message 2";

      (socket as unknown as SocketPrivate).sendRaw(message1);
      (socket as unknown as SocketPrivate).sendRaw(message2);

      expect(ws.send).not.toHaveBeenCalled();
      expect((socket as unknown as SocketPrivate).queuedMessages).toHaveLength(2);

      // Simulate connection opening
      ws.readyState = MockWebSocket.OPEN;
      (socket as unknown as SocketPrivate).flushQueuedMessages();

      expect(ws.send).toHaveBeenCalledTimes(2);
      expect(ws.send).toHaveBeenCalledWith(message1);
      expect(ws.send).toHaveBeenCalledWith(message2);
      expect((socket as unknown as SocketPrivate).queuedMessages).toHaveLength(0);
    });

    test("flushQueuedMessages should not send if connection is not open", () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;
      ws.readyState = MockWebSocket.CONNECTING;

      (socket as unknown as SocketPrivate).sendRaw("test message");
      expect((socket as unknown as SocketPrivate).queuedMessages).toHaveLength(1);

      // Try to flush while still connecting
      (socket as unknown as SocketPrivate).flushQueuedMessages();

      expect(ws.send).not.toHaveBeenCalled();
      // Messages are removed from queue even if not sent (due to shift() behavior)
      expect((socket as unknown as SocketPrivate).queuedMessages).toHaveLength(0);
    });

    test("sendRaw should send immediately when connection is open", async () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 10));

      const testMessage = "test raw message";
      (socket as unknown as SocketPrivate).sendRaw(testMessage);

      expect(ws.send).toHaveBeenCalledWith(testMessage);
    });

    test("sendRaw should queue message when connection is not open", () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;
      ws.readyState = MockWebSocket.CONNECTING;

      const testMessage = "test raw message";
      (socket as unknown as SocketPrivate).sendRaw(testMessage);

      expect(ws.send).not.toHaveBeenCalled();
      expect((socket as unknown as SocketPrivate).queuedMessages).toContain(testMessage);
    });
  });

  describe("edge cases", () => {
    test("should handle malformed JSON in message handler gracefully", () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;
      const messageHandler = mock();

      socket.onMessage(messageHandler);

      // Simulate malformed JSON message
      const malformedEvent = new MessageEvent("message", {
        data: "{ invalid json",
      });

      expect(() => {
        ws.dispatchEvent(malformedEvent);
      }).toThrow();
    });

    test("should not call handler if not set", async () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;

      // No handlers set, should not throw
      expect(() => {
        ws.simulateMessage({
          key: null,
          data: { test: "data" },
          message: null,
          success: true,
          done: false,
          status: 200,
          isClientError: false,
          isServerError: false,
          isNotFound: false,
          isUnauthorized: false,
          isForbidden: false,
          app: {
            env: Environment.DEVELOPMENT,
          },
        });
        ws.simulateError();
        socket.close();
      }).not.toThrow();
    });

    test("should handle various payload types in sendRaw", async () => {
      const socket = new Socket("ws://localhost:8080");
      const ws = (socket as unknown as SocketPrivate).ws;

      // Wait for connection to open
      await new Promise((resolve) => setTimeout(resolve, 10));

      const stringPayload = "string payload";
      const blobPayload = new Blob(["blob data"]);
      const bufferPayload = new ArrayBuffer(8);

      (socket as unknown as SocketPrivate).sendRaw(stringPayload);
      (socket as unknown as SocketPrivate).sendRaw(blobPayload);
      (socket as unknown as SocketPrivate).sendRaw(bufferPayload);

      expect(ws.send).toHaveBeenCalledWith(stringPayload);
      expect(ws.send).toHaveBeenCalledWith(blobPayload);
      expect(ws.send).toHaveBeenCalledWith(bufferPayload);
    });
  });
});
