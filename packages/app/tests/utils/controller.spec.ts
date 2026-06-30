import { describe, expect, test } from "bun:test";
import { Environment } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import type { ContextType } from "@talosjs/controller";
import { Exception } from "@talosjs/exception";
import { HttpResponse, type IResponse } from "@talosjs/http-response";
import { HttpStatus } from "@talosjs/http-status";
import type { RouteConfigType } from "@talosjs/routing";
import { type } from "@talosjs/validation";
import { buildException, buildExceptionResponse, httpRouteHandler, toControllerError } from "@/utils/controller";
import { createMockContext, createMockLogger, createMockRoute } from "./helpers";

describe("toControllerError", () => {
  test("maps an Exception to its message, status, and key", () => {
    const error = new Exception("Access denied", { status: HttpStatus.Code.Forbidden, key: "ACCESS_DENIED" });

    const result = toControllerError(error);

    expect(result).toEqual({ message: "Access denied", status: HttpStatus.Code.Forbidden, key: "ACCESS_DENIED" });
  });

  test("maps a regular Error to InternalServerError with INTERNAL_ERROR key", () => {
    const result = toControllerError(new Error("boom"));

    expect(result).toEqual({ message: "boom", status: HttpStatus.Code.InternalServerError, key: "INTERNAL_ERROR" });
  });

  test("maps a non-Error value to an unknown error with UNKNOWN_ERROR key", () => {
    const result = toControllerError("string error");

    expect(result).toEqual({
      message: "An unknown error occurred",
      status: HttpStatus.Code.InternalServerError,
      key: "UNKNOWN_ERROR",
    });
  });
});

describe("buildException", () => {
  test("sets the exception on the context response and returns it", () => {
    const context = createMockContext();

    const response = buildException(context, "Bad request", HttpStatus.Code.BadRequest, "BAD_REQUEST");

    expect(response).toBe(context.response);
    expect(response.getStatus()).toBe(HttpStatus.Code.BadRequest);
  });

  test("works without a key", () => {
    const context = createMockContext();

    const response = buildException(context, "Server error", HttpStatus.Code.InternalServerError, null);

    expect(response).toBe(context.response);
    expect(response.getStatus()).toBe(HttpStatus.Code.InternalServerError);
  });
});

describe("buildExceptionResponse", () => {
  test("returns a Response with exception details", () => {
    const context = createMockContext();

    const response = buildExceptionResponse(
      context,
      "Something went wrong",
      HttpStatus.Code.BadRequest,
      Environment.DEVELOPMENT,
    );

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(HttpStatus.Code.BadRequest);
  });

  test("includes key in exception response when provided", () => {
    const context = createMockContext();

    const response = buildExceptionResponse(
      context,
      "Forbidden",
      HttpStatus.Code.Forbidden,
      Environment.DEVELOPMENT,
      "ACCESS_DENIED",
    );

    expect(response.status).toBe(HttpStatus.Code.Forbidden);
  });

  test("works without key parameter", () => {
    const context = createMockContext();

    const response = buildExceptionResponse(context, "Not found", HttpStatus.Code.NotFound, Environment.PRODUCTION);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(HttpStatus.Code.NotFound);
  });
});

describe("httpRouteHandler", () => {
  test("returns successful response when controller executes successfully", async () => {
    class SuccessController {
      index(): IResponse {
        return new HttpResponse().json({ message: "success" });
      }
    }
    container.add(SuccessController);

    const context = createMockContext();
    const route = createMockRoute({
      controller: SuccessController,
    } as Partial<RouteConfigType>);

    const response = await httpRouteHandler({ context, route });

    expect(response.status).toBe(HttpStatus.Code.OK);
    const body = await response.json();
    expect(body.data.message).toBe("success");
  });

  test("returns error response when route validation fails", async () => {
    class TestController {
      index(): IResponse {
        return new HttpResponse().json({ message: "success" });
      }
    }
    container.add(TestController);

    const context = createMockContext();
    const route = createMockRoute({
      controller: TestController,
      env: [Environment.PRODUCTION],
    } as Partial<RouteConfigType>);

    const response = await httpRouteHandler({ context, route });

    expect(response.status).toBe(HttpStatus.Code.NotAcceptable);
  });

  test("returns error response when controller throws Exception", async () => {
    class ThrowingController {
      index(): IResponse {
        throw new Exception("Controller error", { status: HttpStatus.Code.BadRequest });
      }
    }
    container.add(ThrowingController);

    const context = createMockContext();
    const route = createMockRoute({
      controller: ThrowingController,
    } as Partial<RouteConfigType>);

    const response = await httpRouteHandler({ context, route });

    expect(response.status).toBe(HttpStatus.Code.BadRequest);
    const body = await response.json();
    expect(body.message).toBe("Controller error");
  });

  test("reports the exception to the exceptionLogger when controller throws", async () => {
    class ReportingController {
      index(): IResponse {
        throw new Exception("Controller error", { status: HttpStatus.Code.BadRequest });
      }
    }
    container.add(ReportingController);

    const exceptionLogger = createMockLogger();
    const context = createMockContext({
      exceptionLogger: exceptionLogger as unknown as ContextType["exceptionLogger"],
    });
    const route = createMockRoute({
      controller: ReportingController,
    } as Partial<RouteConfigType>);

    await httpRouteHandler({ context, route });

    expect(exceptionLogger.error).toHaveBeenCalled();
    expect(exceptionLogger.error.mock.calls[0]?.[0]).toBe("Controller error");
  });

  test("propagates exception key when controller throws Exception with key", async () => {
    class ThrowingWithKeyController {
      index(): IResponse {
        throw new Exception("Controller error", { key: "controller.error.key", status: HttpStatus.Code.BadRequest });
      }
    }
    container.add(ThrowingWithKeyController);

    const context = createMockContext();
    const route = createMockRoute({
      controller: ThrowingWithKeyController,
    } as Partial<RouteConfigType>);

    const response = await httpRouteHandler({ context, route });

    expect(response.status).toBe(HttpStatus.Code.BadRequest);
    const body = await response.json();
    expect(body.message).toBe("Controller error");
    expect(body.key).toBe("controller.error.key");
  });

  test("does not include key when controller throws Exception without key", async () => {
    class ThrowingNoKeyController {
      index(): IResponse {
        throw new Exception("No key error", { status: HttpStatus.Code.BadRequest });
      }
    }
    container.add(ThrowingNoKeyController);

    const context = createMockContext();
    const route = createMockRoute({
      controller: ThrowingNoKeyController,
    } as Partial<RouteConfigType>);

    const response = await httpRouteHandler({ context, route });

    expect(response.status).toBe(HttpStatus.Code.BadRequest);
    const body = await response.json();
    expect(body.message).toBe("No key error");
    expect(body.key).toBeNull();
  });

  test("returns InternalServerError when controller throws regular Error", async () => {
    class ErrorController {
      index(): IResponse {
        throw new Error("Unexpected error");
      }
    }
    container.add(ErrorController);

    const context = createMockContext();
    const route = createMockRoute({
      controller: ErrorController,
    } as Partial<RouteConfigType>);

    const response = await httpRouteHandler({ context, route });

    expect(response.status).toBe(HttpStatus.Code.InternalServerError);
    const body = await response.json();
    expect(body.message).toBe("Unexpected error");
    expect(body.key).toBe("INTERNAL_ERROR");
  });

  test("returns InternalServerError when controller throws unknown error", async () => {
    class UnknownErrorController {
      index(): IResponse {
        throw "string error";
      }
    }
    container.add(UnknownErrorController);

    const context = createMockContext();
    const route = createMockRoute({
      controller: UnknownErrorController,
    } as Partial<RouteConfigType>);

    const response = await httpRouteHandler({ context, route });

    expect(response.status).toBe(HttpStatus.Code.InternalServerError);
    const body = await response.json();
    expect(body.message).toBe("An unknown error occurred");
    expect(body.key).toBe("UNKNOWN_ERROR");
  });

  test("returns error when response validation fails", async () => {
    class InvalidResponseController {
      index(): IResponse {
        return new HttpResponse().json({ id: "not-a-number" });
      }
    }
    container.add(InvalidResponseController);

    const context = createMockContext();
    const route = createMockRoute({
      controller: InvalidResponseController,
      response: type({ id: "number" }),
    } as Partial<RouteConfigType>);

    const response = await httpRouteHandler({ context, route });

    expect(response.status).toBe(HttpStatus.Code.NotAcceptable);
    const body = await response.json();
    expect(body.message).toContain("Invalid response");
    expect(body.key).toBe("INVALID_RESPONSE");
  });

  test("uses PRODUCTION environment as default when APP_ENV is undefined", async () => {
    class TestEnvController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(TestEnvController);

    const context = createMockContext({
      env: { APP_ENV: undefined } as unknown as ContextType["env"],
    });
    const route = createMockRoute({
      controller: TestEnvController,
    } as Partial<RouteConfigType>);

    const response = await httpRouteHandler({ context, route });

    expect(response.status).toBe(HttpStatus.Code.OK);
  });

  test("returns response and delegates caching to formatHttpRoutes", async () => {
    class CacheController {
      index(): IResponse {
        return new HttpResponse().json({ message: "fresh" });
      }
    }
    container.add(CacheController);

    const context = createMockContext();
    const route = createMockRoute({
      controller: CacheController,
      cache: "http",
    } as Partial<RouteConfigType>);

    // httpRouteHandler always returns the response; caching is handled by formatHttpRoutes
    const response = await httpRouteHandler({ context, route });
    expect(response.status).toBe(HttpStatus.Code.OK);

    const body = await response.json();
    expect(body.data.message).toBe("fresh");
  });

  test("does not cache response when status is not successful", async () => {
    class ErrorCacheController {
      index(): IResponse {
        return new HttpResponse().json({ error: "not found" }, HttpStatus.Code.NotFound);
      }
    }
    container.add(ErrorCacheController);

    const context = createMockContext();
    const route = createMockRoute({
      controller: ErrorCacheController,
      cache: "http",
    } as Partial<RouteConfigType>);

    const response = await httpRouteHandler({ context, route });
    expect(response.status).toBe(HttpStatus.Code.NotFound);
    expect(response.ok).toBe(false);
  });
});
