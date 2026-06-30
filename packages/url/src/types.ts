import type { LocaleType } from "@talosjs/translation";
import type { ScalarType } from "@talosjs/types";

export type UrlQueriesType = Record<string, ScalarType> & {
  lang?: LocaleType;
  page?: number;
  limit?: number;
  order?: "ASC" | "DESC";
  orderBy?: string;
  q?: string;
  bearerToken?: string;
};

export interface IReadonlyUrl {
  getNative: () => URL;
  getProtocol: () => string;
  getSubdomain: () => string | null;
  getDomain: () => string;
  getHostname: () => string;
  getPort: () => number;
  getPath: () => string;
  getQueries: () => UrlQueriesType;
  getFragment: () => string;
  getBase: () => string;
  getOrigin: () => string;
  getQuery: (name: string) => ScalarType | null;
  getLang: () => LocaleType;
  getPage: () => number;
  getLimit: () => number;
  getOrder: () => "ASC" | "DESC";
  getOrderBy: () => string | null;
  getSearch: () => string | null;
  getBearerToken: () => string | null;
  toString: () => string;
}

export interface IUrl extends IReadonlyUrl {
  setProtocol: (protocol: string) => IUrl;
  setHostname: (hostname: string) => IUrl;
  setPort: (port: number) => IUrl;
  setPath: (path: string) => IUrl;
  setFragment: (fragment: string) => IUrl;
  addQuery: (key: string, value: ScalarType) => IUrl;
  setQueries: (queries: UrlQueriesType) => IUrl;
  removeQuery: (key: string) => IUrl;
  clearQueries: () => IUrl;
}
