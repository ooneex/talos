import type { IContainer } from "@talosjs/container";
import type { IException } from "@talosjs/exception";
import type { ILogger, LoggerClassType, LogDataType } from "@talosjs/logger";
import type { ScalarType } from "@talosjs/types";

export const logger = (loggers: LoggerClassType[], container: IContainer) => {
  type LogType = ILogger<Record<string, ScalarType>> | ILogger<LogDataType>;
  const instances: LogType[] = loggers.map((l) => container.get<LogType>(l)).filter(Boolean);

  return {
    error: (message: string | IException, data?: Record<string, ScalarType> & LogDataType) => {
      for (const log of instances) log.error(message, data);
    },
    warn: (message: string, data?: Record<string, ScalarType> & LogDataType) => {
      for (const log of instances) log.warn(message, data);
    },
    info: (message: string, data?: Record<string, ScalarType> & LogDataType) => {
      for (const log of instances) log.info(message, data);
    },
    debug: (message: string, data?: Record<string, ScalarType> & LogDataType) => {
      for (const log of instances) log.debug(message, data);
    },
    log: (message: string, data?: Record<string, ScalarType> & LogDataType) => {
      for (const log of instances) log.log(message, data);
    },
    success: (message: string, data?: Record<string, ScalarType> & LogDataType) => {
      for (const log of instances) log.success(message, data);
    },
  };
};
