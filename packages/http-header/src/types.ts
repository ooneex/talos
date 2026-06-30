import type { MimeType } from "@talosjs/http-mimes";
import type { CharsetType, EncodingType, HttpMethodType } from "@talosjs/types";
import type { HEADERS } from "./constants";

export enum ECookieSameSite {
  STRICT = "Strict",
  LAX = "Lax",
  NONE = "None",
}

export enum EXFrameOptions {
  DENY = "DENY",
  SAMEORIGIN = "SAMEORIGIN",
}

export type CookieSameSiteType = `${ECookieSameSite}`;
export type XFrameOptionsType = `${EXFrameOptions}` | string;

export type HeaderFieldType = (typeof HEADERS)[number] | `X-Custom-${string}` | "X-Real-IP";

export type UserAgentType = {
  browser: {
    name?: string;
    version?: string;
    major?: string;
  };
  engine: {
    name?: string;
    version?: string;
  };
  os: {
    name?: string;
    version?: string;
  };
  device: {
    vendor?: string;
    model?: string;
    type?: string;
  };
  cpu: {
    architecture?: string;
  };
};

export type UserAgentBrowserType = UserAgentType["browser"];
export type UserAgentEngineType = UserAgentType["engine"];
export type UserAgentOsType = UserAgentType["os"];
export type UserAgentDeviceType = UserAgentType["device"];
export type UserAgentCpuType = UserAgentType["cpu"];

export interface IUserAgent {
  readonly browser: UserAgentBrowserType;
  readonly engine: UserAgentEngineType;
  readonly os: UserAgentOsType;
  readonly device: UserAgentDeviceType;
  readonly cpu: UserAgentCpuType;
}

export interface IHeader extends IReadonlyHeader {
  readonly native: Headers;

  // Core methods
  add: (name: HeaderFieldType, value: string) => IHeader;
  remove: (name: HeaderFieldType) => IHeader;
  set: (name: HeaderFieldType, value: string) => IHeader;

  // Content handling
  contentType: (value: MimeType, charset?: CharsetType) => IHeader;
  contentLength: (length: number) => IHeader;
  contentDisposition: (value: string) => IHeader;

  // Content type convenience methods
  setJson: (charset?: CharsetType) => IHeader;
  setHtml: (charset?: CharsetType) => IHeader;
  setText: (charset?: CharsetType) => IHeader;
  setForm: (charset?: CharsetType) => IHeader;
  setFormData: (charset?: CharsetType) => IHeader;
  setBlobType: (charset?: CharsetType) => IHeader;

  // Content negotiation
  setAccept: (mimeType: MimeType) => IHeader;
  setLang: (language: string) => IHeader;
  setAcceptEncoding: (encodings: EncodingType[]) => IHeader;

  // Request information
  setHost: (host: string) => IHeader;
  setUserAgent: (userAgent: string) => IHeader;
  setReferer: (referer: string) => IHeader;
  setOrigin: (origin: string) => IHeader;

  // Authentication
  setAuthorization: (value: string) => IHeader;
  setBasicAuth: (token: string) => IHeader;
  setBearerToken: (token: string) => IHeader;

  // Cookies
  setCookie: (
    name: string,
    value: string,
    options?: {
      domain?: string;
      path?: string;
      expires?: Date;
      maxAge?: number;
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: CookieSameSiteType;
    },
  ) => IHeader;

  setCookies: (
    cookies: Array<{
      name: string;
      value: string;
      options?: {
        domain?: string;
        path?: string;
        expires?: Date;
        maxAge?: number;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: CookieSameSiteType;
      };
    }>,
  ) => IHeader;

  addCookie: (
    name: string,
    value: string,
    options?: {
      domain?: string;
      path?: string;
      expires?: Date;
      maxAge?: number;
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: CookieSameSiteType;
    },
  ) => IHeader;

  removeCookie: (
    name: string,
    options?: {
      domain?: string;
      path?: string;
    },
  ) => IHeader;

  // Caching
  setCacheControl: (value: string) => IHeader;
  setEtag: (value: string) => IHeader;
  setLastModified: (date: Date) => IHeader;
  setIfModifiedSince: (date: Date) => IHeader;

  // CORS
  setAccessControlAllowOrigin: (origin: string) => IHeader;
  setAccessControlAllowMethods: (methods: HttpMethodType[]) => IHeader;
  setAccessControlAllowHeaders: (headers: string[]) => IHeader;
  setAccessControlAllowCredentials: (allow: boolean) => IHeader;

  // Security headers
  setContentSecurityPolicy: (policy: string) => IHeader;
  setStrictTransportSecurity: (maxAge: number, includeSubDomains?: boolean, preload?: boolean) => IHeader;
  setXContentTypeOptions: (value?: string) => IHeader;
  setXFrameOptions: (value: XFrameOptionsType) => IHeader;
  setXXSSProtection: (enabled?: boolean, mode?: string) => IHeader;

  // Redirects
  setLocation: (location: string) => IHeader;

  // Utility
  setCustom: (value: string) => IHeader;
}

export interface IReadonlyHeader {
  readonly native: Headers;

  // Core methods
  get: (name: HeaderFieldType) => string | null;
  has: (name: HeaderFieldType) => boolean;
  toJson: () => Record<string, string>;

  // Content handling
  getContentType: () => MimeType | "*/*" | null;
  getContentLength: () => number;
  getCharset: () => CharsetType | null;
  getContentDisposition: () => string | null;

  // Content negotiation
  getAccept: () => MimeType | "*/*" | null;
  getLang: () => { code: string; region?: string } | null;
  getAcceptEncoding: () => EncodingType[] | null;

  // Request information
  getHost: () => string | null;
  getUserAgent: () => IUserAgent | null;
  getReferer: () => string | null;
  getOrigin: () => string | null;

  // Authentication
  getAuthorization: () => string | null;
  getBasicAuth: () => string | null;
  getBearerToken: () => string | null;

  // Cookies
  getCookies: () => Record<string, string> | null;
  getCookie: (name: string) => string | null;

  // Client IP detection
  getIp: () => string | null;
  getXForwardedFor: () => string | null;
  getXRealIP: () => string | null;
  getClientIps: () => string[];

  // Caching
  getCacheControl: () => string | null;
  getEtag: () => string | null;
  getLastModified: () => Date | null;
  getIfModifiedSince: () => Date | null;
  getIfNoneMatch: () => string | null;

  // CORS
  getAccessControlAllowOrigin: () => string | null;
  getAccessControlAllowMethods: () => HttpMethodType[] | null;
  getAccessControlAllowHeaders: () => string[] | null;
  getAccessControlAllowCredentials: () => boolean | null;

  // Security headers
  getContentSecurityPolicy: () => string | null;
  getStrictTransportSecurity: () => string | null;
  getXContentTypeOptions: () => string | null;
  getXFrameOptions: () => string | null;
  getXXSSProtection: () => string | null;

  // Redirects
  getLocation: () => string | null;

  // Request type detection
  isSecure: () => boolean;
  isAjax: () => boolean;
  isCorsRequest: () => boolean;

  // Iterator support
  [Symbol.iterator](): IterableIterator<[HeaderFieldType, string]>;
}
