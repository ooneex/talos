import { mock } from "bun:test";
import { Environment } from "@talosjs/app-env";
import type { ContextType } from "@talosjs/controller";
import { HttpResponse, type IResponse } from "@talosjs/http-response";
import type { RouteConfigType } from "@talosjs/routing";

export const createMockHeader = () => ({
  get: mock(() => null),
  getReferer: mock(() => null),
});

export const createMockLogger = () => ({
  success: mock((..._args: unknown[]) => {}),
  info: mock((..._args: unknown[]) => {}),
  warn: mock((..._args: unknown[]) => {}),
  error: mock((..._args: unknown[]) => {}),
});

export const createMockContext = (
  overrides: { [K in keyof ContextType]?: ContextType[K] | undefined } = {},
): ContextType => {
  const response = new HttpResponse();
  return {
    logger: createMockLogger() as unknown as ContextType["logger"],
    cache: {} as ContextType["cache"],
    route: {
      name: "api.test.list",
      path: "/test" as const,
      method: "GET" as const,
      version: "v1" as const,
      description: "Test route",
    },
    env: { APP_ENV: Environment.DEVELOPMENT } as unknown as ContextType["env"],
    response,
    request: {} as ContextType["request"],
    params: {},
    payload: {},
    queries: {},
    method: "GET",
    header: createMockHeader() as unknown as ContextType["header"],
    files: {},
    ip: "127.0.0.1",
    host: "localhost",
    lang: {} as ContextType["lang"],
    user: null,
    ...overrides,
  } as ContextType;
};

export class DefaultTestController {
  index(): IResponse {
    return new HttpResponse().json({});
  }
}

export const createMockRoute = (overrides: Record<string, unknown> = {}): RouteConfigType => {
  const base: RouteConfigType = {
    name: "api.test.list",
    path: "/test",
    method: "GET",
    version: 1,
    controller: DefaultTestController,
    description: "Test route",
    isSocket: false,
  };
  return { ...base, ...overrides } as RouteConfigType;
};
