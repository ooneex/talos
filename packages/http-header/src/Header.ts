import type { MimeType } from "@talosjs/http-mimes";
import type { CharsetType, EncodingType, HttpMethodType } from "@talosjs/types";
import { ReadonlyHeader } from "./ReadonlyHeader";
import type { HeaderFieldType, IHeader } from "./types";

export class Header extends ReadonlyHeader implements IHeader {
  constructor(headers?: Headers) {
    super(headers || new Headers());
  }

  // Core methods
  public add(name: HeaderFieldType, value: string): this {
    this.native.append(name, value);
    return this;
  }

  public remove(name: HeaderFieldType): this {
    this.native.delete(name);
    return this;
  }

  public set(name: HeaderFieldType, value: string): this {
    this.native.set(name, value);
    return this;
  }

  // Content handling
  public contentType(type: MimeType, charset?: CharsetType): this {
    const typeStr = String(type);
    const value = charset ? `${typeStr}; charset=${charset}` : typeStr;
    this.add("Content-Type", value);

    if (typeStr.startsWith("text/") || typeStr === "application/json") {
      this.add("Accept-Charset", charset || "utf-8");
    }

    return this;
  }

  public contentLength(length: number): this {
    this.add("Content-Length", length.toString());
    return this;
  }

  public contentDisposition(value: string): this {
    return this.add("Content-Disposition", value);
  }

  public clearContentType(): this {
    this.remove("Content-Type");
    this.remove("Accept-Charset");
    return this;
  }

  // Content type convenience methods
  public setJson(charset?: CharsetType): this {
    this.add("Accept", "application/json");
    this.contentType("application/json", charset);
    return this;
  }

  public setHtml(charset?: CharsetType): this {
    return this.contentType("text/html", charset);
  }

  public setText(charset?: CharsetType): this {
    return this.contentType("text/plain", charset);
  }

  public setForm(charset?: CharsetType): this {
    return this.contentType("application/x-www-form-urlencoded", charset);
  }

  public setFormData(charset?: CharsetType): this {
    return this.contentType("multipart/form-data", charset);
  }

  public setBlobType(charset?: CharsetType): this {
    return this.contentType("application/octet-stream", charset);
  }

  // Content negotiation
  public setAccept(mimeType: MimeType): this {
    return this.add("Accept", mimeType as string);
  }

  public setLang(language: string): this {
    return this.set("Accept-Language", language);
  }

  public setAcceptEncoding(encodings: EncodingType[]): this {
    return this.add("Accept-Encoding", encodings.join(", "));
  }

  // Request information
  public setHost(host: string): this {
    return this.add("Host", host);
  }

  public setUserAgent(userAgent: string): this {
    return this.add("User-Agent", userAgent);
  }

  public setReferer(referer: string): this {
    return this.add("Referer", referer);
  }

  public setOrigin(origin: string): this {
    return this.add("Origin", origin);
  }

  // Authentication
  public setAuthorization(value: string): this {
    return this.add("Authorization", value);
  }

  public setBasicAuth(token: string): this {
    return this.add("Authorization", `Basic ${token}`);
  }

  public setBearerToken(token: string): this {
    return this.add("Authorization", `Bearer ${token}`);
  }

  // Cookies
  public setCookie(
    name: string,
    value: string,
    options?: {
      domain?: string;
      path?: string;
      expires?: Date;
      maxAge?: number;
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: "Strict" | "Lax" | "None";
    },
  ): this {
    let cookieValue = `${name}=${value}`;

    if (options?.maxAge !== undefined) {
      cookieValue += `; Max-Age=${options.maxAge}`;
    }
    if (options?.expires) {
      cookieValue += `; Expires=${options.expires.toUTCString()}`;
    }
    if (options?.path) cookieValue += `; Path=${options.path}`;
    if (options?.domain) cookieValue += `; Domain=${options.domain}`;
    if (options?.secure) cookieValue += "; Secure";
    if (options?.httpOnly) cookieValue += "; HttpOnly";
    if (options?.sameSite) cookieValue += `; SameSite=${options.sameSite}`;

    return this.add("Set-Cookie", cookieValue);
  }

  public setCookies(
    cookies: {
      name: string;
      value: string;
      options?: {
        domain?: string;
        path?: string;
        expires?: Date;
        maxAge?: number;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: "Strict" | "Lax" | "None";
      };
    }[],
  ): this {
    cookies.forEach((cookie) => {
      this.setCookie(cookie.name, cookie.value, cookie.options);
    });
    return this;
  }

  public addCookie(
    name: string,
    value: string,
    options?: {
      domain?: string;
      path?: string;
      expires?: Date;
      maxAge?: number;
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: "Strict" | "Lax" | "None";
    },
  ): this {
    return this.setCookie(name, value, options);
  }

  public removeCookie(
    name: string,
    options?: {
      domain?: string;
      path?: string;
    },
  ): this {
    const pastDate = new Date(0); // January 1, 1970
    return this.setCookie(name, "", {
      ...options,
      expires: pastDate,
      maxAge: 0,
    });
  }

  // Caching
  public setCacheControl(value: string): this {
    return this.add("Cache-Control", value);
  }

  public setEtag(value: string): this {
    return this.add("Etag", value);
  }

  public setLastModified(date: Date): this {
    return this.add("Last-Modified", date.toUTCString());
  }

  public setIfModifiedSince(date: Date): this {
    return this.add("If-Modified-Since", date.toUTCString());
  }

  // CORS
  public setAccessControlAllowOrigin(origin: string): this {
    return this.add("Access-Control-Allow-Origin", origin);
  }

  public setAccessControlAllowMethods(methods: HttpMethodType[]): this {
    const value = methods.join(", ");
    return this.add("Access-Control-Allow-Methods", value);
  }

  public setAccessControlAllowHeaders(headers: string[]): this {
    const value = headers.join(", ");
    return this.add("Access-Control-Allow-Headers", value);
  }

  public setAccessControlAllowCredentials(allow: boolean): this {
    return this.add("Access-Control-Allow-Credentials", allow.toString());
  }

  // Security headers
  public setContentSecurityPolicy(policy: string): this {
    return this.add("Content-Security-Policy", policy);
  }

  public setStrictTransportSecurity(maxAge: number, includeSubDomains = false, preload = false): this {
    let value = `max-age=${maxAge}`;
    if (includeSubDomains) value += "; includeSubDomains";
    if (preload) value += "; preload";
    return this.add("Strict-Transport-Security", value);
  }

  public setXContentTypeOptions(value = "nosniff"): this {
    return this.add("X-Content-Type-Options", value);
  }

  public setXFrameOptions(value: "DENY" | "SAMEORIGIN" | string): this {
    return this.add("X-Frame-Options", value);
  }

  public setXXSSProtection(enabled = true, mode?: string): this {
    let value = enabled ? "1" : "0";
    if (enabled && mode) value += `; mode=${mode}`;
    return this.add("X-XSS-Protection", value);
  }

  // Redirects
  public setLocation(location: string): this {
    return this.add("Location", location);
  }

  // Utility
  public setCustom(value: string): this {
    return this.add("X-Custom", value);
  }
}
