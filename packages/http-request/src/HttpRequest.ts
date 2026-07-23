import { Header, type IUserAgent } from "@talosjs/http-header";
import { type IRequestFile, RequestFile } from "@talosjs/http-request-file";
import type { LocaleInfoType, LocaleType } from "@talosjs/translation";
import type { HttpMethodType, ScalarType } from "@talosjs/types";
import { type IUrl, Url } from "@talosjs/url";
import parser from "accept-language-parser";
import type { IRequest, RequestConfigType } from "./types";

export class HttpRequest<Config extends RequestConfigType = RequestConfigType> implements IRequest<Config> {
  public readonly path: string;
  public readonly url: IUrl;
  public readonly method: HttpMethodType;
  public readonly header: Header;
  public readonly userAgent: IUserAgent | null;
  public readonly params: Config["params"] = {};
  public readonly payload: Config["payload"] = {};
  public readonly queries: Config["queries"] = {};
  public readonly form: FormData | null;
  public readonly files: Record<string, IRequestFile> = {};
  public readonly ip: string | null;
  public readonly host: string;
  public readonly lang: LocaleInfoType;

  constructor(
    public readonly native: Readonly<Request>,
    config?: {
      params?: Record<string, ScalarType>;
      form?: FormData | null;
      payload?: Record<string, unknown>;
      ip?: string | null;
    },
  ) {
    this.url = new Url(this.native.url);
    this.path = this.url.getPath();
    this.method = this.native.method.toUpperCase() as HttpMethodType;
    this.header = new Header(native.headers);
    this.queries = this.url.getQueries();
    this.payload = config?.payload || {};
    this.params = config?.params || {};
    this.form = config?.form || null;
    this.userAgent = this.header.getUserAgent();

    if (config?.form) {
      config.form.forEach((value, key) => {
        if (value instanceof File) {
          this.files[key] = new RequestFile(value);
        }
      });
    }

    this.ip = config?.ip || null;
    this.host = this.header.getHost() || "";

    const customLang = this.url.getQuery("lang") || this.url.getQuery("locale") || this.header.get("X-Custom-Lang");
    if (customLang) {
      this.lang = {
        code: customLang as LocaleType,
        region: null,
      };
    } else {
      const languages = parser.parse(this.header.get("Accept-Language") || "en-US");
      const language = languages[0];
      this.lang = {
        code: language?.code as LocaleType,
        region: language?.region ?? null,
      };
    }
  }
}
