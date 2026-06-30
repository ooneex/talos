import type { EnvironmentNameType } from "@talosjs/app-env";
import type { ControllerClassType } from "@talosjs/controller";
import type { FeatureFlagClassType } from "@talosjs/feature-flag";
import type { PermissionClassType } from "@talosjs/permission";
import type { HttpMethodType } from "@talosjs/types";
import type { AssertType, IAssert } from "@talosjs/validation";

export type RouteConfigType = {
  name: string;
  path: `/${string}`;
  method: HttpMethodType;
  version: number;
  params?: Record<string, AssertType | IAssert>;
  queries?: AssertType | IAssert;
  payload?: AssertType | IAssert;
  response?: AssertType | IAssert;
  controller: ControllerClassType;
  description: string;
  env?: EnvironmentNameType[];
  ip?: string[];
  host?: string[];
  roles?: Uppercase<string>[];
  permission?: PermissionClassType;
  featureFlag?: FeatureFlagClassType;
  cache?: string;
  isSocket: boolean;
};

export interface IRouter {
  addRoute: (route: RouteConfigType) => this;
  findRouteByPath: (path: string) => RouteConfigType[] | null;
  findRouteByName: (name: string) => RouteConfigType | null;
  getRoutes: () => Map<string, RouteConfigType[]>;
  getSocketRoutes: () => Map<string, RouteConfigType>;
  getHttpRoutes: () => Map<string, RouteConfigType[]>;
  generate: <P extends Record<string, string | number> = Record<string, string | number>>(
    name: string,
    params?: P,
  ) => string;
}

/**
 * Check if a string segment is a route parameter (starts with :)
 */
export type IsParameter<T extends string> = T extends `:${string}` ? true : false;

/**
 * Extract all parameter names from a route path
 * Examples:
 * - "/users/:id" -> "id"
 * - "/users/:id/bills/:billId" -> "id" | "billId"
 * - "/static/path" -> never
 */
export type ExtractParameters<T extends string> = T extends `${infer _Start}/:${infer Param}/${infer Rest}`
  ? Param | ExtractParameters<`/${Rest}`>
  : T extends `${infer _Start}/:${infer Param}`
    ? Param
    : never;

/**
 * Helper type to check for malformed parameters in a single segment
 */
type HasMalformedParameter<T extends string> = T extends `:${string}:${string}` ? true : false;

/**
 * Helper type to validate each path segment recursively
 */
type ValidateSegments<T extends string> = T extends `${infer Segment}/${infer Rest}`
  ? HasMalformedParameter<Segment> extends true
    ? never
    : ValidateSegments<Rest>
  : HasMalformedParameter<T> extends true
    ? never
    : T;

/**
 * Validate that a route path follows correct patterns
 * - Must start with /
 * - No double slashes (//)
 * - No malformed parameters (like :id:name within same segment)
 * - Parameters must be in format /:paramName
 * - Allow multiple parameters like /users/:id/emails/:emailId
 */
export type ValidateRoutePath<T extends string> = T extends `/${infer Path}`
  ? T extends `${string}//${string}`
    ? never // Reject paths with double slashes
    : T extends `${string}/:${string}/:`
      ? never // Reject trailing colon after parameter
      : T extends `${string}/:`
        ? never // Reject parameter without name
        : T extends `${string}:${string}/`
          ? never // Reject trailing slash after parameter with colon
          : ValidateSegments<Path> extends never
            ? never
            : T
  : never; // Must start with /

/**
 * Main route path type that ensures valid path structure
 */
export type RoutePathType<T extends string = string> = ValidateRoutePath<T>;

/**
 * Extract route parameters as a typed record
 * Examples:
 * - RouteParameters<"/users/:id"> -> { id: string }
 * - RouteParameters<"/users/:id/bills/:billId"> -> { id: string; billId: string }
 * - RouteParameters<"/static"> -> Record<string, never>
 */
export type RouteParameters<T extends string> = ExtractParameters<T> extends never
  ? Record<string, never>
  : Record<ExtractParameters<T>, string>;

/**
 * Check if a route path has parameters
 */
export type HasParameters<T extends string> = ExtractParameters<T> extends never ? false : true;

/**
 * Get parameter count for a route path
 */
export type CountParameters<
  T extends string,
  Count extends readonly unknown[] = readonly [],
> = ExtractParameters<T> extends never
  ? Count["length"]
  : T extends `${infer _Start}/:${infer _Param}/${infer Rest}`
    ? CountParameters<`/${Rest}`, readonly [...Count, unknown]>
    : T extends `${infer _Start}/:${infer _Param}`
      ? [...Count, unknown]["length"]
      : Count["length"];

export type ParameterCount<T extends string> = CountParameters<T>;

/**
 * Utility type to ensure route path is valid at compile time
 * Usage: const path: ValidRoutePath = "/users/:id/bills/:billId";
 */
export type ValidRoutePath = RoutePathType<string>;
