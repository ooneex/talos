import { beforeEach, describe, expect, test } from "bun:test";
import { Environment } from "@talosjs/app-env";
import { Header } from "@talosjs/http-header";
import { HttpStatus } from "@talosjs/http-status";
import { HttpResponse, type IResponse } from "@/index";

describe("HttpResponse", () => {
  let response: HttpResponse;

  beforeEach(() => {
    response = new HttpResponse();
  });

  describe("constructor", () => {
    test("should create instance with default header", () => {
      const response = new HttpResponse();
      expect(response.header).toBeInstanceOf(Header);
    });

    test("should create instance with provided header", () => {
      const customHeader = new Header();
      customHeader.set("X-Custom", "test");
      const response = new HttpResponse(customHeader);

      expect(response.header).toBe(customHeader);
      expect(response.header.get("X-Custom")).toBe("test");
    });
  });

  describe("json method", () => {
    test("should set JSON data with default status 200", () => {
      const data = { message: "Hello, World!" };
      const result = response.json(data);

      expect(result).toBe(response); // Should return this for chaining
      expect(response.header.get("Content-Type")).toBe("application/json");

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.OK);
      expect(webResponse.json()).resolves.toEqual({
        key: null,
        app: {
          env: "production",
        },
        data,
        done: false,
        isClientError: false,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message: null,
        status: 200,
        success: true,
      });
    });

    test("should set JSON data with custom status", () => {
      const data = { message: "Created" };
      response.json(data, HttpStatus.Code.Created);

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.Created);
      expect(webResponse.json()).resolves.toEqual({
        key: null,
        app: {
          env: "production",
        },
        data,
        done: false,
        isClientError: false,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message: null,
        status: 201,
        success: true,
      });
    });

    test("should reset other properties when setting JSON", () => {
      // First set as exception
      response.exception("Error occurred", { key: crypto.randomUUID() });

      // Then set as JSON
      const data = { success: true };
      response.json(data);

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.OK);
      expect(webResponse.json()).resolves.toEqual({
        key: null,
        app: {
          env: "production",
        },
        data,
        done: false,
        isClientError: false,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message: null,
        status: 200,
        success: true,
      });
    });

    test("should handle complex data structures", () => {
      const data = {
        user: { id: 1, name: "John" },
        items: [{ id: 1, title: "Item 1" }],
        metadata: { count: 1, page: 1 },
      };

      response.json(data);
      const webResponse = response.get();
      expect(webResponse.json()).resolves.toEqual({
        key: null,
        app: {
          env: "production",
        },
        data,
        done: false,
        isClientError: false,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message: null,
        status: 200,
        success: true,
      });
    });
  });

  describe("exception method", () => {
    test("should set exception with default status 500", () => {
      const key = crypto.randomUUID();
      const message = "Internal Server Error";
      const result = response.exception(message, { key });

      expect(result).toBe(response); // Should return this for chaining
      expect(response.header.get("Content-Type")).toBe("application/json");

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.InternalServerError);

      expect(webResponse.json()).resolves.toEqual({
        key,
        app: {
          env: "production",
        },
        data: {},
        done: false,
        isClientError: false,
        isForbidden: false,
        isNotFound: false,
        isServerError: true,
        isUnauthorized: false,
        message,
        status: HttpStatus.Code.InternalServerError,
        success: false,
      });
    });

    test("should set exception with custom status and data", () => {
      const key = crypto.randomUUID();
      const message = "Bad Request Error";
      const data = { field: "email", reason: "invalid format" };

      response.exception(message, {
        key,
        status: HttpStatus.Code.BadRequest,
        data,
      });

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.BadRequest);

      expect(webResponse.json()).resolves.toEqual({
        key,
        app: {
          env: "production",
        },
        data,
        done: false,
        isClientError: true,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message,
        status: HttpStatus.Code.BadRequest,
        success: false,
      });
    });

    test("should reset redirect properties when setting exception", () => {
      // First set as redirect
      response.redirect("https://example.com");

      // Then set as exception
      response.exception("Error occurred", { key: crypto.randomUUID() });

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.InternalServerError);
      expect(response.header.get("Location")).toBeNull();
    });
  });

  describe("notFound method", () => {
    test("should set not found exception with default status 404", () => {
      const key = crypto.randomUUID();
      const message = "Resource not found";
      const result = response.notFound(message, { key });

      expect(result).toBe(response); // Should return this for chaining
      expect(response.header.get("Content-Type")).toBe("application/json");

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.NotFound);

      expect(webResponse.json()).resolves.toEqual({
        key,
        app: {
          env: "production",
        },
        data: {},
        done: false,
        isClientError: true,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message,
        status: HttpStatus.Code.NotFound,
        success: false,
      });
    });

    test("should set not found with default key NOT_FOUND", () => {
      const message = "Resource not found";
      response.notFound(message);

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.NotFound);

      expect(webResponse.json()).resolves.toEqual({
        key: "NOT_FOUND",
        app: {
          env: "production",
        },
        data: {},
        done: false,
        isClientError: true,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message,
        status: HttpStatus.Code.NotFound,
        success: false,
      });
    });

    test("should set not found with custom status and data", () => {
      const key = crypto.randomUUID();
      const message = "User not found";
      const data = { userId: 123 };

      response.notFound(message, {
        key,
        status: HttpStatus.Code.Gone,
        data,
      });

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.Gone);

      expect(webResponse.json()).resolves.toEqual({
        key,
        app: {
          env: "production",
        },
        data,
        done: false,
        isClientError: true,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message,
        status: HttpStatus.Code.Gone,
        success: false,
      });
    });
  });

  describe("redirect method", () => {
    test("should set redirect with string URL and default status 302", () => {
      const url = "https://example.com";
      const result = response.redirect(url);

      expect(result).toBe(response); // Should return this for chaining
      expect(response.header.get("Location")).toBe(url);

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.Found);
      expect(webResponse.body).toBeNull();
    });

    test("should set redirect with URL object and custom status", () => {
      const url = new URL("https://example.com/path");
      response.redirect(url, HttpStatus.Code.MovedPermanently);

      expect(response.header.get("Location")).toBe(url.toString());

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.MovedPermanently);
      expect(webResponse.body).toBeNull();
    });

    test("should reset other properties when setting redirect", () => {
      // First set as JSON
      response.json({ message: "test" });

      // Then set as redirect
      response.redirect("https://example.com");

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.Found);
      expect(webResponse.body).toBeNull();
    });

    test("should handle relative URLs", () => {
      const url = "/dashboard";
      response.redirect(url);

      expect(response.header.get("Location")).toBe(url);

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.Found);
    });
  });

  describe("stream method", () => {
    const createStream = (chunks: string[]): ReadableStream<Uint8Array> => {
      const encoder = new TextEncoder();
      return new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });
    };

    test("should return this for chaining", () => {
      const result = response.stream(createStream(["hello"]));

      expect(result).toBe(response);
    });

    test("should mark the response as a stream", () => {
      expect(response.isStream()).toBe(false);

      response.stream(createStream(["hello"]));

      expect(response.isStream()).toBe(true);
    });

    test("should default to octet-stream content type and status 200", async () => {
      response.stream(createStream(["chunk-1", "chunk-2"]));

      const webResponse = response.get();
      expect(webResponse).toBeInstanceOf(Response);
      expect(webResponse.status).toBe(HttpStatus.Code.OK);
      expect(webResponse.headers.get("Content-Type")).toBe("application/octet-stream");
      expect(await webResponse.text()).toBe("chunk-1chunk-2");
    });

    test("should honor a custom content type and status", async () => {
      response.stream(createStream(["data: hello\n\n"]), {
        contentType: "text/event-stream",
        status: HttpStatus.Code.Accepted,
      });

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.Accepted);
      expect(webResponse.headers.get("Content-Type")).toBe("text/event-stream");
      expect(await webResponse.text()).toBe("data: hello\n\n");
    });

    test("should stream from an async iterable", async () => {
      async function* generate(): AsyncGenerator<string> {
        yield "a";
        yield "b";
        yield "c";
      }

      response.stream(generate());

      const webResponse = response.get();
      expect(await webResponse.text()).toBe("abc");
    });

    test("should stream from a push-based producer and auto-close", async () => {
      response.stream(async (writer) => {
        await writer.write("chunk-1");
        await writer.write("chunk-2");
      });

      const webResponse = response.get();
      expect(webResponse.headers.get("Content-Type")).toBe("application/octet-stream");
      expect(await webResponse.text()).toBe("chunk-1chunk-2");
    });

    test("should propagate producer errors to the stream", async () => {
      response.stream(async (writer) => {
        await writer.write("partial");
        throw new Error("boom");
      });

      const webResponse = response.get();
      await expect(webResponse.text()).rejects.toThrow();
    });

    test("should expose an abort signal to the producer", () => {
      let captured: AbortSignal | null = null;
      response.stream((writer) => {
        captured = writer.signal;
      });

      response.get();
      expect(captured).toBeInstanceOf(AbortSignal);
    });

    test("should not be a stream after switching to json", () => {
      response.stream(createStream(["hello"]));
      expect(response.isStream()).toBe(true);

      response.json({ message: "switched" });

      expect(response.isStream()).toBe(false);
      const webResponse = response.get();
      expect(webResponse.headers.get("Content-Type")).toBe("application/json");
    });
  });

  describe("sse method", () => {
    test("should return this for chaining and mark the response as a stream", () => {
      const result = response.sse(async (writer) => {
        await writer.send("hello");
      });

      expect(result).toBe(response);
      expect(response.isStream()).toBe(true);
    });

    test("should set Server-Sent Events headers and status 200", () => {
      response.sse(async (writer) => {
        await writer.send("hello");
      });

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.OK);
      expect(webResponse.headers.get("Content-Type")).toBe("text/event-stream");
      expect(webResponse.headers.get("Cache-Control")).toBe("no-cache");
      expect(webResponse.headers.get("Connection")).toBe("keep-alive");
    });

    test("should frame a plain string message as a data line", async () => {
      response.sse(async (writer) => {
        await writer.send("hello");
      });

      const webResponse = response.get();
      expect(await webResponse.text()).toBe("data: hello\n\n");
    });

    test("should frame event, id, retry and JSON data", async () => {
      response.sse(async (writer) => {
        await writer.send({ event: "update", id: "42", retry: 1000, data: { count: 1 } });
      });

      const webResponse = response.get();
      expect(await webResponse.text()).toBe('event: update\nid: 42\nretry: 1000\ndata: {"count":1}\n\n');
    });

    test("should split multi-line data into multiple data lines", async () => {
      response.sse(async (writer) => {
        await writer.send({ data: "line-1\nline-2" });
      });

      const webResponse = response.get();
      expect(await webResponse.text()).toBe("data: line-1\ndata: line-2\n\n");
    });

    test("should emit comments for keep-alive", async () => {
      response.sse(async (writer) => {
        await writer.comment("ping");
        await writer.send("hello");
      });

      const webResponse = response.get();
      expect(await webResponse.text()).toBe(": ping\n\ndata: hello\n\n");
    });

    test("should emit a sequence of events from a push-based producer", async () => {
      response.sse(async (writer) => {
        for (let i = 1; i <= 3; i++) {
          await writer.send({ event: "tick", data: i });
        }
      });

      const webResponse = response.get();
      expect(await webResponse.text()).toBe("event: tick\ndata: 1\n\nevent: tick\ndata: 2\n\nevent: tick\ndata: 3\n\n");
    });

    test("should honor a custom status", () => {
      response.sse(
        async (writer) => {
          await writer.send("hello");
        },
        { status: HttpStatus.Code.Accepted },
      );

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.Accepted);
    });

    test("should reset SSE headers when switching to json", () => {
      response.sse(async (writer) => {
        await writer.send("hello");
      });
      expect(response.isStream()).toBe(true);

      response.json({ message: "switched" });

      expect(response.isStream()).toBe(false);
      const webResponse = response.get();
      expect(webResponse.headers.get("Content-Type")).toBe("application/json");
    });
  });

  describe("get method", () => {
    test("should return Web API Response for JSON data", async () => {
      const data = { message: "test" };
      response.json(data, HttpStatus.Code.Created);

      const webResponse = response.get();
      expect(webResponse).toBeInstanceOf(Response);
      expect(webResponse.status).toBe(HttpStatus.Code.Created);
      expect(webResponse.headers.get("Content-Type")).toBe("application/json");

      const responseData = await webResponse.json();
      expect(responseData).toEqual({
        key: null,
        app: {
          env: "production",
        },
        data,
        done: false,
        isClientError: false,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message: null,
        status: 201,
        success: true,
      });
    });

    test("should return Web API Response for redirect", () => {
      const url = "https://example.com";
      response.redirect(url, HttpStatus.Code.SeeOther);

      const webResponse = response.get();
      expect(webResponse).toBeInstanceOf(Response);
      expect(webResponse.status).toBe(HttpStatus.Code.SeeOther);
      expect(webResponse.headers.get("Location")).toBe(url);
      expect(webResponse.body).toBeNull();
    });

    test("should return Web API Response for exception", async () => {
      const key = crypto.randomUUID();
      const message = "Test error";
      const data = { code: "ERR001" };
      response.exception(message, {
        key,
        status: HttpStatus.Code.UnprocessableEntity,
        data,
      });

      const webResponse = response.get();
      expect(webResponse).toBeInstanceOf(Response);
      expect(webResponse.status).toBe(HttpStatus.Code.UnprocessableEntity);
      expect(webResponse.headers.get("Content-Type")).toBe("application/json");

      const responseData = await webResponse.json();
      expect(responseData).toEqual({
        key,
        app: {
          env: "production",
        },
        data,
        done: false,
        isClientError: true,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message,
        status: HttpStatus.Code.UnprocessableEntity,
        success: false,
      });
    });

    test("should return Web API Response with null body for empty JSON", () => {
      response.json({});

      const webResponse = response.get();
      const responseBody = webResponse.body;
      expect(responseBody).not.toBeNull();
    });
  });

  describe("method chaining", () => {
    test("should support method chaining for json", () => {
      const data = { message: "chaining test" };
      const result = response.json(data, HttpStatus.Code.Created);

      expect(result).toBe(response);

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.Created);
      expect(webResponse.json()).resolves.toEqual({
        key: null,
        app: {
          env: "production",
        },
        data,
        done: false,
        isClientError: false,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message: null,
        status: 201,
        success: true,
      });
    });

    test("should support method chaining for exception", () => {
      const message = "Chaining error";
      const result = response.exception(message, {
        key: crypto.randomUUID(),
        status: HttpStatus.Code.BadRequest,
      });

      expect(result).toBe(response);

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.BadRequest);
    });

    test("should support method chaining for notFound", () => {
      const message = "Not found chaining";
      const result = response.notFound(message, { key: crypto.randomUUID(), status: HttpStatus.Code.Gone });

      expect(result).toBe(response);

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.Gone);
    });

    test("should support method chaining for redirect", () => {
      const url = "https://chain.example.com";
      const result = response.redirect(url, HttpStatus.Code.MovedPermanently);

      expect(result).toBe(response);

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.MovedPermanently);
      expect(response.header.get("Location")).toBe(url);
    });
  });

  describe("state transitions", () => {
    test("should properly transition from json to exception", async () => {
      // Start with JSON
      response.json({ message: "initial" }, HttpStatus.Code.OK);

      // Switch to exception
      response.exception("Error occurred", { key: crypto.randomUUID(), status: HttpStatus.Code.BadRequest });

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.BadRequest);

      const data = await webResponse.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("Error occurred");
    });

    test("should properly transition from exception to json", async () => {
      // Start with exception
      response.exception("Initial error", { key: crypto.randomUUID() });

      // Switch to JSON
      response.json({ success: true }, HttpStatus.Code.OK);

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.OK);

      const data = await webResponse.json();
      expect(data).toEqual({
        key: null,
        app: {
          env: "production",
        },
        data: { success: true },
        done: false,
        isClientError: false,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message: null,
        status: 200,
        success: true,
      });
    });

    test("should properly transition from redirect to json", async () => {
      // Start with redirect
      response.redirect("https://example.com");

      // Switch to JSON
      response.json({ message: "switched" });

      const webResponse = response.get();
      expect(webResponse.status).toBe(HttpStatus.Code.OK);
      expect(response.header.get("Location")).toBeNull();

      const data = await webResponse.json();
      expect(data).toEqual({
        key: null,
        app: {
          env: "production",
        },
        data: { message: "switched" },
        done: false,
        isClientError: false,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message: null,
        status: 200,
        success: true,
      });
    });
  });

  describe("TypeScript generics", () => {
    test("should work with typed data", () => {
      interface User extends Record<string, unknown> {
        id: number;
        name: string;
        email: string;
      }

      const userResponse = new HttpResponse<User>();
      const userData: User = {
        id: 1,
        name: "John Doe",
        email: "john@example.com",
      };

      userResponse.json(userData);

      const webResponse = userResponse.get();
      expect(webResponse.json()).resolves.toEqual({
        key: null,
        app: {
          env: "production",
        },
        data: userData,
        done: false,
        isClientError: false,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message: null,
        status: 200,
        success: true,
      });
    });

    test("should work with typed exception data", async () => {
      interface ErrorData extends Record<string, unknown> {
        field: string;
        code: string;
      }

      const errorResponse = new HttpResponse<ErrorData>();
      const errorData: ErrorData = {
        field: "email",
        code: "INVALID_FORMAT",
      };

      errorResponse.exception("Validation failed", { key: crypto.randomUUID(), data: errorData });

      const webResponse = errorResponse.get();
      const responseData = await webResponse.json();
      expect(responseData.data).toEqual(errorData);
    });
  });

  describe("interface compliance", () => {
    test("should implement IResponse interface", () => {
      const response: IResponse = new HttpResponse();

      expect(typeof response.json).toBe("function");
      expect(typeof response.stream).toBe("function");
      expect(typeof response.sse).toBe("function");
      expect(typeof response.isStream).toBe("function");
      expect(typeof response.exception).toBe("function");
      expect(typeof response.notFound).toBe("function");
      expect(typeof response.redirect).toBe("function");
      expect(typeof response.get).toBe("function");
      expect(typeof response.getData).toBe("function");
      expect(response.header).toBeDefined();
    });
  });

  describe("edge cases", () => {
    test("should handle empty string message in exception", async () => {
      response.exception("", { key: crypto.randomUUID() });

      const webResponse = response.get();
      const data = await webResponse.json();
      expect(data.message).toBe("");
    });

    test("should handle empty string message in notFound", async () => {
      response.notFound("", { key: crypto.randomUUID() });

      const webResponse = response.get();
      const data = await webResponse.json();
      expect(data.message).toBe("");
    });

    test("should handle empty object as JSON data", async () => {
      const emptyData = {};
      response.json(emptyData);

      const webResponse = response.get();
      const data = await webResponse.json();
      expect(data).toEqual({
        key: null,
        app: {
          env: "production",
        },
        data: emptyData,
        done: false,
        isClientError: false,
        isForbidden: false,
        isNotFound: false,
        isServerError: false,
        isUnauthorized: false,
        message: null,
        status: 200,
        success: true,
      });
    });

    test("should handle URL object toString conversion", () => {
      const url = new URL("https://example.com/path?query=value#hash");
      response.redirect(url);

      expect(response.header.get("Location")).toBe(url.toString());
    });
  });

  describe("header integration", () => {
    test("should preserve custom headers set before json", () => {
      response.header.set("X-Custom-Header", "custom-value");
      response.json({ message: "test" });

      const webResponse = response.get();
      expect(webResponse.headers.get("X-Custom-Header")).toBe("custom-value");
      expect(webResponse.headers.get("Content-Type")).toBe("application/json");
    });

    test("should preserve custom headers set before exception", () => {
      response.header.set("X-Request-ID", "12345");
      response.exception("Error occurred", { key: crypto.randomUUID() });

      const webResponse = response.get();
      expect(webResponse.headers.get("X-Request-ID")).toBe("12345");
      expect(webResponse.headers.get("Content-Type")).toBe("application/json");
    });

    test("should preserve custom headers set before redirect", () => {
      response.header.set("X-Custom-Tracking", "redirect-tracking");
      response.redirect("https://example.com");

      const webResponse = response.get();
      expect(webResponse.headers.get("X-Custom-Tracking")).toBe("redirect-tracking");
      expect(webResponse.headers.get("Location")).toBe("https://example.com");
    });
  });

  describe("getData method", () => {
    test("should return null when no data is set", () => {
      expect(response.getData()).toBeNull();
    });

    test("should return data after json is called", () => {
      const data = { message: "test" };
      response.json(data);

      expect(response.getData()).toEqual(data);
    });

    test("should return data after exception is called with data", () => {
      const data = { field: "email", code: "INVALID" };
      response.exception("Validation error", { key: crypto.randomUUID(), data });

      expect(response.getData()).toEqual(data);
    });

    test("should return null after exception is called without data", () => {
      response.exception("Error occurred", { key: crypto.randomUUID() });

      expect(response.getData()).toBeNull();
    });

    test("should return data after notFound is called with data", () => {
      const data = { resourceId: 123 };
      response.notFound("Resource not found", { key: crypto.randomUUID(), data });

      expect(response.getData()).toEqual(data);
    });

    test("should return null after redirect is called", () => {
      response.json({ message: "test" });
      response.redirect("https://example.com");

      expect(response.getData()).toBeNull();
    });
  });

  describe("getStatus method", () => {
    test("should return default status 200", () => {
      expect(response.getStatus()).toBe(HttpStatus.Code.OK);
    });

    test("should return status after json is called", () => {
      response.json({ message: "test" }, HttpStatus.Code.Created);

      expect(response.getStatus()).toBe(HttpStatus.Code.Created);
    });

    test("should return status after exception is called", () => {
      response.exception("Error occurred", { key: crypto.randomUUID() });

      expect(response.getStatus()).toBe(HttpStatus.Code.InternalServerError);
    });

    test("should return custom status after exception is called with config", () => {
      response.exception("Bad request", { key: crypto.randomUUID(), status: HttpStatus.Code.BadRequest });

      expect(response.getStatus()).toBe(HttpStatus.Code.BadRequest);
    });

    test("should return status after notFound is called", () => {
      response.notFound("Not found", { key: crypto.randomUUID() });

      expect(response.getStatus()).toBe(HttpStatus.Code.NotFound);
    });

    test("should return status after redirect is called", () => {
      response.redirect("https://example.com");

      expect(response.getStatus()).toBe(HttpStatus.Code.Found);
    });

    test("should return custom status after redirect is called", () => {
      response.redirect("https://example.com", HttpStatus.Code.MovedPermanently);

      expect(response.getStatus()).toBe(HttpStatus.Code.MovedPermanently);
    });
  });

  describe("done property", () => {
    test("should default to false", () => {
      expect(response.done).toBe(false);
    });

    test("should be settable to true", () => {
      response.done = true;
      expect(response.done).toBe(true);
    });

    test("should be included in response data", async () => {
      response.done = true;
      response.json({ message: "test" });

      const webResponse = response.get();
      const data = await webResponse.json();
      expect(data.done).toBe(true);
    });
  });

  describe("get method with environment parameter", () => {
    test("should use production environment by default", async () => {
      response.json({ message: "test" });

      const webResponse = response.get();
      const data = await webResponse.json();
      expect(data.app.env).toBe("production");
    });

    test("should use provided development environment", async () => {
      response.json({ message: "test" });

      const webResponse = response.get(Environment.DEVELOPMENT);
      const data = await webResponse.json();
      expect(data.app.env).toBe("development");
    });

    test("should use provided test environment", async () => {
      response.json({ message: "test" });

      const webResponse = response.get(Environment.TEST);
      const data = await webResponse.json();
      expect(data.app.env).toBe("test");
    });

    test("should use provided staging environment", async () => {
      response.json({ message: "test" });

      const webResponse = response.get(Environment.STAGING);
      const data = await webResponse.json();
      expect(data.app.env).toBe("staging");
    });
  });
});
