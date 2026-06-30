import type { IAppEnv } from "@talosjs/app-env";
import type { ICache } from "@talosjs/cache";
import type { Header } from "@talosjs/http-header";
import type { IRequest, RequestConfigType } from "@talosjs/http-request";
import type { IRequestFile } from "@talosjs/http-request-file";
import type { IResponse } from "@talosjs/http-response";
import type { ILogger, LogDataType } from "@talosjs/logger";
import type { IPermission } from "@talosjs/permission";
import type { IRateLimiter } from "@talosjs/rate-limit";
import type { LocaleInfoType } from "@talosjs/translation";
import type { HttpMethodType, ScalarType } from "@talosjs/types";
import type { IUser } from "@talosjs/user";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type ControllerClassType = new (...args: any[]) => IController<any>;

export interface IController<T extends ContextConfigType = ContextConfigType> {
  index: (context: ContextType<T>) => Promise<IResponse<T["response"]>> | IResponse<T["response"]>;
}

export type ContextConfigType = {
  // biome-ignore lint/suspicious/noExplicitAny: trust me
  response: Record<string, any>;
} & Partial<RequestConfigType>;

export type ContextType<T extends ContextConfigType = ContextConfigType> = {
  logger: ILogger<Record<string, ScalarType>> | ILogger<LogDataType>;
  exceptionLogger?: ILogger;
  cache?: ICache;
  rateLimiter?: IRateLimiter;
  route?: {
    name: string;
    path: `/${string}`;
    method: HttpMethodType;
    version: number;
    description: string;
    roles?: Uppercase<string>[];
  } | null;
  env: IAppEnv;
  response: IResponse<T["response"]>;
  request: IRequest<Omit<RequestConfigType, "response">>;
  params: T["params"];
  payload: T["payload"];
  queries: T["queries"];
  method: HttpMethodType;
  header: Header;
  files: Record<string, IRequestFile>;
  ip: string | null;
  host: string;
  lang: LocaleInfoType;
  user: IUser | null;
  permission?: IPermission;
};
