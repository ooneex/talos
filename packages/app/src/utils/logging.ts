import { container } from "@talosjs/container";
import type { ContextType } from "@talosjs/controller";
import { Exception } from "@talosjs/exception";
import { HttpStatus, type StatusCodeType } from "@talosjs/http-status";
import type { LogDataType, RequestFileLogType } from "@talosjs/logger";
import type { ScalarType } from "@talosjs/types";

type RequestFilesType = ContextType["files"];

type LevelLoggerType = {
  success: (message: string, data?: LogDataType) => void;
  info: (message: string, data?: LogDataType) => void;
  warn: (message: string, data?: LogDataType) => void;
  error: (message: string, data?: LogDataType) => void;
};

export const logSwallowedError = (operation: string, error: unknown): void => {
  const logger = container.hasConstant("logger") ? container.getConstant<LevelLoggerType>("logger") : undefined;

  if (!logger) {
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  logger.error(`${operation} failed: ${message}`);
};

const serializeForm = (form: FormData): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      result[key] = value;
    } else {
      const file = value as File;
      result[key] = { name: file.name, size: file.size, type: file.type };
    }
  }

  return result;
};

const serializeFiles = (files: RequestFilesType): RequestFileLogType[] =>
  Object.values(files).map((file) => ({
    id: file.id,
    name: file.name,
    originalName: file.originalName,
    type: String(file.type),
    size: file.size,
    extension: file.extension,
    isImage: file.isImage,
    isVideo: file.isVideo,
    isAudio: file.isAudio,
    isPdf: file.isPdf,
  }));

const buildLogData = (context: ContextType, status: StatusCodeType): LogDataType => {
  const logData: LogDataType = {};
  logData.date = new Date();
  logData.status = status;
  logData.method = context.method;
  logData.path = context.route?.path || "";
  if (context.route?.version) logData.version = context.route.version;
  logData.params = context.params as Record<string, ScalarType>;
  logData.payload = context.payload as Record<string, unknown>;
  logData.queries = context.queries as Record<string, ScalarType>;

  if (context.ip) logData.ip = context.ip;
  if (context.host) logData.host = context.host;
  if (context.lang?.code) logData.lang = context.lang.code;

  const userAgent = context.header.get("User-Agent");
  if (userAgent) logData.userAgent = userAgent;

  const referer = context.header.getReferer();
  if (referer) logData.referer = referer;

  // Full incoming request: headers, cookies, form fields and uploaded files.
  const requestHeaders = context.header.toJson?.();
  if (requestHeaders && Object.keys(requestHeaders).length > 0) logData.requestHeaders = requestHeaders;

  const cookies = context.header.getCookies?.();
  if (cookies && Object.keys(cookies).length > 0) logData.cookies = cookies;

  const form = context.request?.form;
  if (form) {
    const serializedForm = serializeForm(form);
    if (Object.keys(serializedForm).length > 0) logData.form = serializedForm;
  }

  if (context.files && Object.keys(context.files).length > 0) {
    logData.files = serializeFiles(context.files);
  }

  // Full outgoing response: status, headers and body.
  const responseHeaders = context.response?.header?.toJson?.();
  if (responseHeaders && Object.keys(responseHeaders).length > 0) logData.responseHeaders = responseHeaders;

  const responseData = context.response?.getData?.();
  if (responseData) logData.responseData = responseData as Record<string, unknown>;

  if (context.user?.id) logData.userId = context.user.id;
  if (context.user?.email) logData.email = context.user.email;
  if (context.user?.lastName) logData.lastName = context.user.lastName;
  if (context.user?.firstName) logData.firstName = context.user.firstName;

  return logData;
};

export const logRequest = (context: ContextType, statusOverride?: StatusCodeType, methodLabel?: string): void => {
  const logger = context.logger as LevelLoggerType | undefined;

  if (!logger) {
    return;
  }

  const status = statusOverride ?? context.response.getStatus();
  const logData = buildLogData(context, status);
  const message = `${methodLabel ?? context.method} ${context.route?.path || ""}`;

  if (status >= 500) {
    logger.error(message, logData);
  } else if (status >= 400) {
    logger.warn(message, logData);
  } else if (status >= 300) {
    logger.info(message, logData);
  } else {
    logger.success(message, logData);
  }
};

const colorize = (text: string, color: string): string => {
  try {
    const ansi = Bun.color(color, "ansi");
    return ansi ? `${ansi}${text}\u001b[0m` : text;
  } catch {
    return text;
  }
};

const bold = (text: string): string => `\u001b[1m${text}\u001b[0m`;
const dim = (text: string): string => `\u001b[2m${text}\u001b[0m`;

export type ServerStartInfoType = {
  baseUrl: string;
  appEnv: string;
  port: number;
  isLocal: boolean;
};

export const logServerStart = (info: ServerStartInfoType): void => {
  const { baseUrl, appEnv, port, isLocal } = info;

  const brand = colorize("◆", "#007AFF");
  const ready = colorize("✔", "#00C851");
  const label = (text: string): string => colorize(text.padEnd(9), "#79B");

  const lines = [
    "",
    `  ${brand} ${bold(colorize("Talos", "#007AFF"))} ${dim("server")}`,
    "",
    `  ${ready} ${label("Ready")}${bold(colorize(baseUrl, "#00C851"))}`,
    `    ${label("Env")}${colorize(appEnv, isLocal ? "#FFCC00" : "#FF3B30")}`,
    `    ${label("Port")}${colorize(String(port), "#8E8E93")}`,
    "",
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
};

export const logException = (context: ContextType, error: unknown): void => {
  const exceptionLogger = context.exceptionLogger as LevelLoggerType | undefined;

  if (!exceptionLogger) {
    return;
  }

  const status = (error instanceof Exception ? error.status : HttpStatus.Code.InternalServerError) as StatusCodeType;
  const logData = buildLogData(context, status);

  if (error instanceof Error) {
    logData.exceptionName = error.constructor.name;
  }
  if (error instanceof Exception) {
    const stackTrace = error.stackToJson();
    if (stackTrace) logData.stackTrace = stackTrace;
  }

  const message = error instanceof Error ? error.message : "An unknown error occurred";

  exceptionLogger.error(message, logData);
};
