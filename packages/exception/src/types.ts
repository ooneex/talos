import type { StatusCodeType } from "@talosjs/http-status";

export type ExceptionStackFrameType = {
  functionName?: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  source: string;
};

export interface IException {
  readonly key: string | null;
  readonly date: Date;
  readonly status: StatusCodeType;
  readonly data: Readonly<Record<string, unknown>>;
  readonly native?: Error;
  readonly message: string;
  readonly name: string;
  readonly stack?: string;
  stackToJson: () => ExceptionStackFrameType[] | null;
}
