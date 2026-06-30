import type { Header, IUserAgent } from "@talosjs/http-header";
import type { IRequestFile } from "@talosjs/http-request-file";
import type { LocaleInfoType } from "@talosjs/translation";
import type { HttpMethodType, ScalarType } from "@talosjs/types";
import type { IUrl, UrlQueriesType } from "@talosjs/url";

export type RequestConfigType = {
  params?: Record<string, ScalarType>;
  payload?: Record<string, unknown>;
  queries?: UrlQueriesType;
};

export interface IRequest<Config extends RequestConfigType = RequestConfigType> {
  readonly native: Readonly<Request>;
  readonly path: string;
  readonly url: IUrl;
  readonly method: HttpMethodType;
  readonly header: Header;
  readonly userAgent: IUserAgent | null;
  readonly params: Config["params"];
  readonly payload: Config["payload"];
  readonly queries: Config["queries"];
  readonly form: FormData | null;
  readonly files: Record<string, IRequestFile>;
  readonly ip: string | null;
  readonly host: string;
  readonly lang: LocaleInfoType;
}
