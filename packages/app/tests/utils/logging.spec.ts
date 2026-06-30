import { describe, expect, mock, test } from "bun:test";
import type { ContextType } from "@talosjs/controller";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import type { LogDataType } from "@talosjs/logger";
import { logException, logRequest } from "@/utils/logging";
import { createMockContext, createMockLogger } from "./helpers";

describe("logRequest", () => {
  test("calls logger.success for 2xx status", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
      method: "GET",
    });
    context.response.json({}, HttpStatus.Code.OK);

    logRequest(context);

    expect(logger.success).toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("uses the methodLabel in the log message when provided", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
      method: "GET",
    });

    logRequest(context, HttpStatus.Code.OK, "WS");

    expect(logger.success).toHaveBeenCalled();
    expect(logger.success.mock.calls[0]?.[0]).toBe("WS /test");
  });

  test("uses the context method in the log message when no methodLabel is provided", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
      method: "GET",
    });

    logRequest(context, HttpStatus.Code.OK);

    expect(logger.success).toHaveBeenCalled();
    expect(logger.success.mock.calls[0]?.[0]).toBe("GET /test");
  });

  test("calls logger.info for 3xx status", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
    });
    context.response.redirect("/other", HttpStatus.Code.MovedPermanently);

    logRequest(context);

    expect(logger.info).toHaveBeenCalled();
    expect(logger.success).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("calls logger.warn for 4xx status", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
    });
    context.response.exception("Not found", { status: HttpStatus.Code.NotFound });

    logRequest(context);

    expect(logger.warn).toHaveBeenCalled();
    expect(logger.success).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("calls logger.error for 5xx status", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
    });
    context.response.exception("Server error", { status: HttpStatus.Code.InternalServerError });

    logRequest(context);

    expect(logger.error).toHaveBeenCalled();
    expect(logger.success).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("uses statusOverride when provided", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
    });
    context.response.json({}, HttpStatus.Code.OK);

    logRequest(context, HttpStatus.Code.InternalServerError);

    expect(logger.error).toHaveBeenCalled();
    expect(logger.success).not.toHaveBeenCalled();
  });

  test("includes method and path in log message", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
      method: "POST",
      route: {
        name: "api.users.create",
        path: "/users" as const,
        method: "POST" as const,
        version: 1,
        description: "Create user",
      },
    });
    context.response.json({}, HttpStatus.Code.Created);

    logRequest(context);

    const callArgs = logger.success.mock.calls[0];
    expect(callArgs?.[0]).toBe("POST /users");
  });

  test("returns early when logger is null", () => {
    const context = createMockContext({
      logger: null as unknown as ContextType["logger"],
    });

    expect(() => logRequest(context)).not.toThrow();
  });

  test("includes user info when user is present", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
      user: {
        id: "user-123",
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        roles: [],
      } as unknown as ContextType["user"],
    });
    context.response.json({}, HttpStatus.Code.OK);

    logRequest(context);

    expect(logger.success).toHaveBeenCalled();
    const logData = logger.success.mock.calls[0]?.[1] as LogDataType;
    expect(logData.userId).toBe("user-123");
    expect(logData.email).toBe("test@example.com");
    expect(logData.firstName).toBe("John");
    expect(logData.lastName).toBe("Doe");
  });

  test("includes client info when available", () => {
    const logger = createMockLogger();
    const header = {
      get: mock((name: string) => {
        if (name === "User-Agent") return "Mozilla/5.0";
        return null;
      }),
      getReferer: mock(() => "https://example.com"),
    };
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
      header: header as unknown as ContextType["header"],
      ip: "10.0.0.1",
    });
    context.response.json({}, HttpStatus.Code.OK);

    logRequest(context);

    const logData = logger.success.mock.calls[0]?.[1] as LogDataType;
    expect(logData.ip).toBe("10.0.0.1");
    expect(logData.userAgent).toBe("Mozilla/5.0");
    expect(logData.referer).toBe("https://example.com");
  });

  test("includes route version when present", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
      route: {
        name: "api.test.list",
        path: "/test" as const,
        method: "GET" as const,
        version: 2,
        description: "Test route",
      },
    });
    context.response.json({}, HttpStatus.Code.OK);

    logRequest(context);

    const logData = logger.success.mock.calls[0]?.[1] as LogDataType;
    expect(logData.version).toBe(2);
  });

  test("uses empty path when route is null", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
      route: null,
    });

    logRequest(context);

    const callArgs = logger.success.mock.calls[0];
    expect(callArgs?.[0]).toBe("GET ");
  });

  test("includes params, payload, and queries in log data", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
      params: { id: "42" },
      payload: { name: "test" },
      queries: { page: "1" } as unknown as ContextType["queries"],
    });
    context.response.json({}, HttpStatus.Code.OK);

    logRequest(context);

    const logData = logger.success.mock.calls[0]?.[1] as LogDataType;
    expect(logData.params).toEqual({ id: "42" });
    expect(logData.payload).toEqual({ name: "test" });
    expect(logData.queries).toEqual({ page: "1" });
  });

  test("includes host and request language in log data", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
      host: "api.example.com",
      lang: { code: "fr", region: "FR" } as unknown as ContextType["lang"],
    });
    context.response.json({}, HttpStatus.Code.OK);

    logRequest(context);

    const logData = logger.success.mock.calls[0]?.[1] as LogDataType;
    expect(logData.host).toBe("api.example.com");
    expect(logData.lang).toBe("fr");
  });

  test("includes request headers and cookies in log data", () => {
    const logger = createMockLogger();
    const header = {
      get: mock(() => null),
      getReferer: mock(() => null),
      toJson: mock(() => ({ "user-agent": "Mozilla/5.0", "content-type": "application/json" })),
      getCookies: mock(() => ({ session: "abc123" })),
    };
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
      header: header as unknown as ContextType["header"],
    });
    context.response.json({}, HttpStatus.Code.OK);

    logRequest(context);

    const logData = logger.success.mock.calls[0]?.[1] as LogDataType;
    expect(logData.requestHeaders).toEqual({ "user-agent": "Mozilla/5.0", "content-type": "application/json" });
    expect(logData.cookies).toEqual({ session: "abc123" });
  });

  test("includes form fields and uploaded files in log data", () => {
    const logger = createMockLogger();
    const form = new FormData();
    form.append("name", "John");
    form.append("avatar", new File(["data"], "avatar.png", { type: "image/png" }));

    const files = {
      avatar: {
        id: "file-1",
        name: "avatar.png",
        originalName: "my avatar.png",
        type: "image/png",
        size: 4,
        extension: "png",
        isImage: true,
        isVideo: false,
        isAudio: false,
        isPdf: false,
      },
    };

    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
      request: { form } as unknown as ContextType["request"],
      files: files as unknown as ContextType["files"],
    });
    context.response.json({}, HttpStatus.Code.OK);

    logRequest(context);

    const logData = logger.success.mock.calls[0]?.[1] as LogDataType;
    expect(logData.form?.name).toBe("John");
    expect(logData.form?.avatar).toEqual({ name: "avatar.png", size: 4, type: "image/png" });
    expect(logData.files).toHaveLength(1);
    expect(logData.files?.[0]).toMatchObject({
      id: "file-1",
      originalName: "my avatar.png",
      type: "image/png",
      extension: "png",
      isImage: true,
    });
  });

  test("includes response headers and body in log data", () => {
    const logger = createMockLogger();
    const context = createMockContext({
      logger: logger as unknown as ContextType["logger"],
    });
    context.response.json({ id: "42", name: "test" }, HttpStatus.Code.OK);

    logRequest(context);

    const logData = logger.success.mock.calls[0]?.[1] as LogDataType;
    expect(logData.responseHeaders?.["content-type"]).toContain("application/json");
    expect(logData.responseData).toMatchObject({ id: "42", name: "test" });
  });
});

describe("logException", () => {
  test("returns early when exceptionLogger is not set", () => {
    const context = createMockContext();

    expect(() => logException(context, new Error("boom"))).not.toThrow();
  });

  test("logs an Exception with its status, name, and stack trace", () => {
    const exceptionLogger = createMockLogger();
    const context = createMockContext({
      exceptionLogger: exceptionLogger as unknown as ContextType["exceptionLogger"],
    });
    const error = new Exception("Not authorized", {
      key: "UNAUTHORIZED",
      status: HttpStatus.Code.Unauthorized,
    });

    logException(context, error);

    expect(exceptionLogger.error).toHaveBeenCalled();
    const [message, logData] = exceptionLogger.error.mock.calls[0] as [string, LogDataType];
    expect(message).toBe("Not authorized");
    expect(logData.status).toBe(HttpStatus.Code.Unauthorized);
    expect(logData.exceptionName).toBe("Exception");
    expect(logData.stackTrace).toBeDefined();
  });

  test("logs a generic Error with a 500 status and its name", () => {
    const exceptionLogger = createMockLogger();
    const context = createMockContext({
      exceptionLogger: exceptionLogger as unknown as ContextType["exceptionLogger"],
    });

    logException(context, new TypeError("bad type"));

    const [message, logData] = exceptionLogger.error.mock.calls[0] as [string, LogDataType];
    expect(message).toBe("bad type");
    expect(logData.status).toBe(HttpStatus.Code.InternalServerError);
    expect(logData.exceptionName).toBe("TypeError");
    expect(logData.stackTrace).toBeUndefined();
  });

  test("logs a fallback message for non-Error values", () => {
    const exceptionLogger = createMockLogger();
    const context = createMockContext({
      exceptionLogger: exceptionLogger as unknown as ContextType["exceptionLogger"],
    });

    logException(context, "boom");

    const [message, logData] = exceptionLogger.error.mock.calls[0] as [string, LogDataType];
    expect(message).toBe("An unknown error occurred");
    expect(logData.status).toBe(HttpStatus.Code.InternalServerError);
    expect(logData.exceptionName).toBeUndefined();
  });

  test("includes request context in the exception log data", () => {
    const exceptionLogger = createMockLogger();
    const header = {
      get: mock((name: string) => (name === "User-Agent" ? "Mozilla/5.0" : null)),
      getReferer: mock(() => "https://example.com"),
    };
    const context = createMockContext({
      exceptionLogger: exceptionLogger as unknown as ContextType["exceptionLogger"],
      method: "POST",
      ip: "10.0.0.1",
      header: header as unknown as ContextType["header"],
      params: { id: "42" },
      user: {
        id: "user-123",
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        roles: [],
      } as unknown as ContextType["user"],
    });

    logException(context, new Error("boom"));

    const logData = exceptionLogger.error.mock.calls[0]?.[1] as LogDataType;
    expect(logData.method).toBe("POST");
    expect(logData.ip).toBe("10.0.0.1");
    expect(logData.userAgent).toBe("Mozilla/5.0");
    expect(logData.referer).toBe("https://example.com");
    expect(logData.params).toEqual({ id: "42" });
    expect(logData.userId).toBe("user-123");
    expect(logData.email).toBe("test@example.com");
  });
});
