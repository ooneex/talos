import type { MimeType } from "@talosjs/http-mimes";
import type { CharsetType, EncodingType, HttpMethodType } from "@talosjs/types";
import { UAParser } from "ua-parser-js";
import type { HeaderFieldType, IReadonlyHeader, IUserAgent } from "./types";

export class ReadonlyHeader implements IReadonlyHeader {
  constructor(public readonly native: Headers) {}

  public get(name: HeaderFieldType): string | null {
    return this.native.get(name);
  }

  public has(name: HeaderFieldType): boolean {
    return this.native.has(name);
  }

  public toJson(): Record<string, string> {
    const headers: Record<string, string> = {};

    this.native.forEach((value, key) => {
      headers[key] = value;
    });

    return headers;
  }

  public getContentType(): MimeType | "*/*" | null {
    return this.get("Content-Type") as MimeType | "*/*" | null;
  }

  public getContentLength(): number {
    const length = this.get("Content-Length") || null;

    return length ? Number.parseInt(length, 10) : 0;
  }

  public getCharset(): CharsetType | null {
    const contentType = this.getContentType();

    if (!contentType) {
      return null;
    }

    const match = (contentType as string).match(/charset *= *(?<charset>[a-z0-9-]+)/i);

    if (!match) {
      return null;
    }

    return (match[1]?.toUpperCase() || null) as CharsetType | null;
  }

  public getContentDisposition(): string | null {
    return this.get("Content-Disposition");
  }

  // Content negotiation
  public getAccept(): MimeType | "*/*" | null {
    return (this.get("Accept") ?? null) as MimeType | "*/*" | null;
  }

  public getLang(): { code: string; region?: string } | null {
    const acceptLanguage = this.get("Accept-Language");

    if (!acceptLanguage || acceptLanguage.trim() === "") {
      return null;
    }

    // Parse the first language from Accept-Language header (same logic as getAcceptLanguage)
    const firstLang = acceptLanguage
      .split(",")
      .map((lang) => lang.split(";")[0]?.trim())
      .filter((lang): lang is string => Boolean(lang))[0];

    if (!firstLang) {
      return null;
    }

    const parts = firstLang.split("-");

    const code = parts[0];
    if (!code) {
      return null;
    }

    if (parts.length === 1) {
      return { code };
    }

    const region = parts[1];
    return {
      code,
      ...(region && { region }),
    };
  }

  public getAcceptEncoding(): EncodingType[] | null {
    const encoding = this.get("Accept-Encoding");

    if (!encoding) {
      return null;
    }

    return encoding.split(",").map((val) => val.trim()) as EncodingType[] | null;
  }

  public getHost(): string | null {
    return this.get("Host");
  }

  public getUserAgent(): IUserAgent | null {
    const userAgent = this.get("User-Agent") || null;

    return userAgent ? UAParser(userAgent) : null;
  }

  public getReferer(): string | null {
    return this.get("Referer");
  }

  public getOrigin(): string | null {
    return this.get("Origin");
  }

  // Authentication
  public getAuthorization(): string | null {
    return this.get("Authorization");
  }

  public getBasicAuth(): string | null {
    const auth = this.get("Authorization");

    if (!auth) {
      return null;
    }

    const match = auth.match(/Basic +(?<auth>[^, ]+)/);

    if (!match) {
      return null;
    }

    return match[1] || null;
  }

  public getBearerToken(): string | null {
    const token = this.get("Authorization") || null;

    const match = token?.match(/Bearer +(?<token>[^, ]+)/);

    return match?.[1] || null;
  }

  public getCookies(): Record<string, string> | null {
    const cookieHeader = this.get("Cookie");

    if (!cookieHeader) {
      return null;
    }

    const cookies: Record<string, string> = {};

    cookieHeader.split(";").forEach((cookie) => {
      const [key, ...valueParts] = cookie.trim().split("=");
      if (key && valueParts.length > 0) {
        const value = valueParts.join("=");
        cookies[key.trim()] = decodeURIComponent(value.trim());
      }
    });

    return Object.keys(cookies).length > 0 ? cookies : null;
  }

  public getCookie(name: string): string | null {
    const cookies = this.getCookies();

    return cookies?.[name] || null;
  }

  public getIp(): string | null {
    return this.get("X-Forwarded-For") || this.get("X-Real-IP") || null;
  }

  public getXForwardedFor(): string | null {
    return this.get("X-Forwarded-For");
  }

  public getXRealIP(): string | null {
    return this.get("X-Real-IP");
  }

  public getClientIps(): string[] {
    const ips: string[] = [];

    const xForwardedFor = this.getXForwardedFor();
    if (xForwardedFor) {
      const forwardedIps = xForwardedFor.split(",").map((ip) => ip.trim());
      ips.push(...forwardedIps);
    }

    const xRealIp = this.getXRealIP();
    if (xRealIp && !ips.includes(xRealIp)) {
      ips.push(xRealIp);
    }

    const ip = this.getIp();
    if (ip && !ips.includes(ip)) {
      ips.push(ip);
    }

    return ips.filter((ip) => ip && ip.length > 0);
  }

  public getCacheControl(): string | null {
    return this.get("Cache-Control");
  }

  public getEtag(): string | null {
    return this.get("Etag");
  }

  public getLastModified(): Date | null {
    const lastModified = this.get("Last-Modified");
    return lastModified ? new Date(lastModified) : null;
  }

  public getIfModifiedSince(): Date | null {
    const ifModifiedSince = this.get("If-Modified-Since");
    return ifModifiedSince ? new Date(ifModifiedSince) : null;
  }

  public getIfNoneMatch(): string | null {
    return this.get("If-None-Match");
  }

  public getAccessControlAllowOrigin(): string | null {
    return this.get("Access-Control-Allow-Origin");
  }

  public getAccessControlAllowMethods(): HttpMethodType[] | null {
    const methods = this.get("Access-Control-Allow-Methods");

    if (!methods) {
      return null;
    }

    return methods.split(",").map((method) => method.trim()) as HttpMethodType[];
  }

  public getAccessControlAllowHeaders(): string[] | null {
    const headers = this.get("Access-Control-Allow-Headers");

    if (!headers) {
      return null;
    }

    return headers.split(",").map((header) => header.trim());
  }

  public getAccessControlAllowCredentials(): boolean | null {
    const credentials = this.get("Access-Control-Allow-Credentials");

    if (!credentials) {
      return null;
    }

    return credentials.toLowerCase() === "true";
  }

  public getContentSecurityPolicy(): string | null {
    return this.get("Content-Security-Policy");
  }

  public getStrictTransportSecurity(): string | null {
    return this.get("Strict-Transport-Security");
  }

  public getXContentTypeOptions(): string | null {
    return this.get("X-Content-Type-Options");
  }

  public getXFrameOptions(): string | null {
    return this.get("X-Frame-Options");
  }

  public getXXSSProtection(): string | null {
    return this.get("X-XSS-Protection");
  }

  public getLocation(): string | null {
    return this.get("Location");
  }

  public isSecure(): boolean {
    const proto = this.get("X-Forwarded-Proto");
    return proto === "https";
  }

  public isAjax(): boolean {
    return this.get("X-Requested-With")?.toLowerCase() === "xmlhttprequest";
  }

  public isCorsRequest(): boolean {
    return this.has("Origin");
  }

  public *[Symbol.iterator](): IterableIterator<[HeaderFieldType, string]> {
    const entries: [HeaderFieldType, string][] = [];
    this.native.forEach((value, key) => {
      entries.push([key as HeaderFieldType, value]);
    });
    for (const entry of entries) {
      yield entry;
    }
  }
}
