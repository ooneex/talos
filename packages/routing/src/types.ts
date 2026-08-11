import type { EnvironmentNameType } from "@talosjs/app-env";
import type { ControllerClassType } from "@talosjs/controller";
import type { FeatureFlagClassType } from "@talosjs/feature-flag";
import type { PermissionClassType } from "@talosjs/permission";
import type { RoleType } from "@talosjs/role";
import type { HttpMethodType } from "@talosjs/types";
import type { AssertRecordType, AssertType, IAssert } from "@talosjs/validation";
import type { AssertFile } from "@talosjs/validation/constraints/AssertFile";

export type RouteConfigType = {
  name: string;
  path: `/${string}`;
  method: HttpMethodType;
  version: number;
  params?: AssertRecordType;
  queries?: AssertType | IAssert;
  payload?: AssertType | IAssert;
  files?: AssertFile;
  response?: AssertType | IAssert;
  controller: ControllerClassType;
  description: string;
  env?: EnvironmentNameType[];
  ip?: string[];
  host?: string[];
  roles?: RoleType[];
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
export type IsParameterType<T extends string> = T extends `:${string}` ? true : false;

/**
 * Extract all parameter names from a route path
 * Examples:
 * - "/users/:id" -> "id"
 * - "/users/:id/bills/:billId" -> "id" | "billId"
 * - "/static/path" -> never
 */
export type ExtractParametersType<T extends string> = T extends `${infer _Start}/:${infer Param}/${infer Rest}`
  ? Param | ExtractParametersType<`/${Rest}`>
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
export type ValidateRoutePathType<T extends string> = T extends `/${infer Path}`
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
export type RoutePathType<T extends string = string> = ValidateRoutePathType<T>;

/**
 * Extract route parameters as a typed record
 * Examples:
 * - RouteParametersType<"/users/:id"> -> { id: string }
 * - RouteParametersType<"/users/:id/bills/:billId"> -> { id: string; billId: string }
 * - RouteParametersType<"/static"> -> Record<string, never>
 */
export type RouteParametersType<T extends string> = ExtractParametersType<T> extends never
  ? Record<string, never>
  : Record<ExtractParametersType<T>, string>;

/**
 * Check if a route path has parameters
 */
export type HasParametersType<T extends string> = ExtractParametersType<T> extends never ? false : true;

/**
 * Get parameter count for a route path
 */
export type CountParametersType<
  T extends string,
  Count extends readonly unknown[] = readonly [],
> = ExtractParametersType<T> extends never
  ? Count["length"]
  : T extends `${infer _Start}/:${infer _Param}/${infer Rest}`
    ? CountParametersType<`/${Rest}`, readonly [...Count, unknown]>
    : T extends `${infer _Start}/:${infer _Param}`
      ? [...Count, unknown]["length"]
      : Count["length"];

export type ParameterCountType<T extends string> = CountParametersType<T>;

/**
 * Utility type to ensure route path is valid at compile time
 * Usage: const path: ValidRoutePathType = "/users/:id/bills/:billId";
 */
export type ValidRoutePathType = RoutePathType<string>;
