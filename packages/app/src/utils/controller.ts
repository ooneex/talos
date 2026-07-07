import type { EnvironmentNameType } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import type { ContextType } from "@talosjs/controller";
import { Exception } from "@talosjs/exception";
import type { IResponse } from "@talosjs/http-response";
import { HttpStatus, type StatusCodeType } from "@talosjs/http-status";
import type { RouteConfigType } from "@talosjs/routing";
import { DEFAULT_CACHE_TTL, safeCacheGet, safeCacheSet } from "./cache";
import { logException, logRequest } from "./logging";
import { validateResponse, validateRouteAccess } from "./validation";

export type ControllerErrorType = { message: string; status: StatusCodeType; key?: string | null };

export type HttpRouteHandlerOptionsType = {
  context: ContextType;
  route: RouteConfigType;
  cacheKey?: string | null;
};

type CachedResponseType = {
  body: string;
  status: number;
  headers: Record<string, string>;
};

// Headers that must never be replayed from the cache to another user.
const SENSITIVE_HEADERS = new Set(["set-cookie", "authorization"]);

export const toControllerError = (error: unknown): ControllerErrorType => {
  if (error instanceof Exception) {
    return { message: error.message, status: error.status as StatusCodeType, key: error.key };
  }
  if (error instanceof Error) {
    return { message: error.message, status: HttpStatus.Code.InternalServerError, key: "INTERNAL_ERROR" };
  }
  return {
    message: "An unknown error occurred",
    status: HttpStatus.Code.InternalServerError,
    key: "UNKNOWN_ERROR",
  };
};

export const buildException = (
  context: ContextType,
  message: string,
  status: StatusCodeType,
  key?: string | null,
): IResponse => {
  return context.response.exception(message, { status, ...(key ? { key } : {}) });
};

export const buildExceptionResponse = (
  context: ContextType,
  message: string,
  status: StatusCodeType,
  env: EnvironmentNameType,
  key?: string | null,
): Response => {
  return buildException(context, message, status, key).get(env);
};

const executeController = async (
  controller: { index: (context: ContextType) => Promise<IResponse> | IResponse },
  context: ContextType,
): Promise<[IResponse, null] | [null, ControllerErrorType]> => {
  try {
    const response = await controller.index(context);
    return [response, null];
  } catch (error: unknown) {
    logException(context, error);
    return [null, toControllerError(error)];
  }
};

export const httpRouteHandler = async ({
  context,
  route,
  cacheKey = null,
}: HttpRouteHandlerOptionsType): Promise<Response> => {
  const currentEnv = context.env.APP_ENV;

  const validationError = await validateRouteAccess(context, route, currentEnv);
  if (validationError) {
    const httpResponse = buildExceptionResponse(
      context,
      validationError.message,
      validationError.status,
      currentEnv,
      validationError.key,
    );
    logRequest(context);
    return httpResponse;
  }

  // Cache lookup runs only after middlewares and all access checks have passed,
  // so a cached response can never bypass auth, allowed-user, or permission checks
  if (cacheKey && context.cache) {
    const cached = await safeCacheGet<CachedResponseType>(context.cache, cacheKey);

    if (cached) {
      logRequest(context, cached.status as StatusCodeType);
      return new Response(cached.body, {
        status: cached.status,
        headers: cached.headers,
      });
    }
  }

  const controller = container.get(route.controller);

  const [response, controllerError] = await executeController(controller, context);
  if (controllerError) {
    const httpResponse = buildExceptionResponse(
      context,
      controllerError.message,
      controllerError.status,
      currentEnv,
      controllerError.key,
    );
    logRequest(context);
    return httpResponse;
  }

  const isStream = response.isStream();

  if (!isStream) {
    const responseValidationError = validateResponse(route, response.getData());
    if (responseValidationError) {
      const httpResponse = buildExceptionResponse(
        context,
        responseValidationError.message,
        responseValidationError.status,
        currentEnv,
        responseValidationError.key,
      );
      logRequest(context);
      return httpResponse;
    }
  }

  const httpResponse = response.get(currentEnv);

  // Streaming responses are consumed once and cannot be buffered for caching
  if (!isStream && cacheKey && context.cache && httpResponse.ok) {
    const headers: Record<string, string> = {};
    httpResponse.headers.forEach((value, key) => {
      if (!SENSITIVE_HEADERS.has(key)) {
        headers[key] = value;
      }
    });

    await safeCacheSet(
      context.cache,
      cacheKey,
      {
        body: await httpResponse.clone().text(),
        status: httpResponse.status,
        headers,
      },
      DEFAULT_CACHE_TTL,
    );
  }

  logRequest(context);

  return httpResponse;
};
