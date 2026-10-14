import type { ResponseDataType } from "@talosjs/http-response";
import type { LocaleInfoType } from "@talosjs/translation";

export type RequestDataType = {
  payload?: Record<string, unknown>;
  queries?: Record<string, boolean | number | bigint | string>;
  lang?: LocaleInfoType;
};

export type SocketOptionsType = {
  /**
   * The token the server reads from the `bearerToken` query parameter, since a browser WebSocket
   * cannot send an `Authorization` header. It is encoded into the URL for you.
   */
  bearerToken?: string;
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
