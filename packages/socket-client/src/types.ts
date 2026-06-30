import type { ResponseDataType } from "@talosjs/http-response";
import type { LocaleInfoType } from "@talosjs/translation";

export type RequestDataType = {
  payload?: Record<string, unknown>;
  queries?: Record<string, boolean | number | bigint | string>;
  lang?: LocaleInfoType;
};

export interface ISocket<
  SendData extends RequestDataType = RequestDataType,
  Response extends Record<string, unknown> = Record<string, unknown>,
> {
  close: (code?: number, reason?: string) => void;
  send: (data: SendData) => void;
  onMessage: (handler: (response: ResponseDataType<Response>) => void) => void;
  onOpen: (handler: (event: Event) => void) => void;
  onClose: (handler: (event: CloseEvent) => void) => void;
  onError: (handler: (event: Event, response?: ResponseDataType<Response>) => void) => void;
}
