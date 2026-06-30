import type { ExceptionStackFrameType, IException } from "@talosjs/exception";
import type { HttpMethodType, ScalarType } from "@talosjs/types";

// biome-ignore lint/suspicious/noExplicitAny: Required for decorator compatibility with @inject parameters
export type LoggerClassType = new (...args: any[]) => ILogger | ILogger<LogDataType>;

export type LoggerOptionsType = {
  showArrow?: boolean;
  showTimestamp?: boolean;
  showLevel?: boolean;
  useSymbol?: boolean;
};

export type RequestFileLogType = {
  id: string;
  name: string;
  originalName: string;
  type: string;
  size: number;
  extension: string;
  isImage: boolean;
  isVideo: boolean;
  isAudio: boolean;
  isPdf: boolean;
};

export interface ILogger<Data = Record<string, ScalarType>> {
  init: () => Promise<void> | void;
  error: (message: string | IException, data?: Data, options?: LoggerOptionsType) => Promise<void> | void;
  warn: (message: string, data?: Data, options?: LoggerOptionsType) => Promise<void> | void;
  info: (message: string, data?: Data, options?: LoggerOptionsType) => Promise<void> | void;
  debug: (message: string, data?: Data, options?: LoggerOptionsType) => Promise<void> | void;
  log: (message: string, data?: Data, options?: LoggerOptionsType) => Promise<void> | void;
  success: (message: string, data?: Data, options?: LoggerOptionsType) => Promise<void> | void;
}

export enum ELogLevel {
  ERROR = "ERROR",
  WARN = "WARN",
  INFO = "INFO",
  DEBUG = "DEBUG",
  LOG = "LOG",
  SUCCESS = "SUCCESS",
}

export type LevelType = `${ELogLevel}`;

export type LogDataType = {
  level?: LevelType;
  message?: string;
  date?: Date;
  userId?: string;
  email?: string;
  lastName?: string;
  firstName?: string;
  status?: number;
  exceptionName?: string;
  stackTrace?: ExceptionStackFrameType[];
  ip?: string;
  method?: HttpMethodType;
  path?: string;
  version?: number;
  userAgent?: string;
  referer?: string;
  params?: Record<string, ScalarType>;
  payload?: Record<string, unknown>;
  queries?: Record<string, ScalarType>;
  host?: string;
  lang?: string;
  requestHeaders?: Record<string, string>;
  cookies?: Record<string, string>;
  form?: Record<string, unknown>;
  files?: RequestFileLogType[];
  responseHeaders?: Record<string, string>;
  responseData?: Record<string, unknown> | null;
};
