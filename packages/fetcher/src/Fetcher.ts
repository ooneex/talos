import { Header } from "@talosjs/http-header";
import type { MimeType } from "@talosjs/http-mimes";
import type { ResponseDataType } from "@talosjs/http-response";
import type { HttpMethodType } from "@talosjs/types";
import type { IFetcher } from "./types";

export class Fetcher implements IFetcher {
  private abortController: AbortController;
  public readonly header: Header = new Header();

  constructor(private baseURL?: string) {
    this.abortController = new AbortController();
  }

  public setBearerToken(token: string): this {
    this.header.setBearerToken(token);

    return this;
  }

  public setBasicToken(token: string): this {
    this.header.setBasicAuth(token);

    return this;
  }

  public clearBearerToken(): this {
    this.header.remove("Authorization");

    return this;
  }

  public clearBasicToken(): this {
    this.header.remove("Authorization");

    return this;
  }

  public setContentType(contentType: MimeType): this {
    this.header.contentType(contentType);

    return this;
  }

  public setLang(lang: string): this {
    this.header.setLang(lang);

    return this;
  }

  public abort(): this {
    this.abortController.abort();
    this.abortController = new AbortController();

    return this;
  }

  public clone(): Fetcher {
    const cloned = new Fetcher(this.baseURL);
    return cloned;
  }

  public async get<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
  ): Promise<ResponseDataType<T>> {
    return this.request<T>("GET", path);
  }

  public async post<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    data?: unknown,
  ): Promise<ResponseDataType<T>> {
    return this.request<T>("POST", path, data);
  }

  public async put<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    data?: unknown,
  ): Promise<ResponseDataType<T>> {
    return this.request<T>("PUT", path, data);
  }

  public async patch<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    data?: unknown,
  ): Promise<ResponseDataType<T>> {
    return this.request<T>("PATCH", path, data);
  }

  public async delete<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
  ): Promise<ResponseDataType<T>> {
    return this.request<T>("DELETE", path);
  }

  public async head<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
  ): Promise<ResponseDataType<T>> {
    return this.request<T>("HEAD", path);
  }

  public async options<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
  ): Promise<ResponseDataType<T>> {
    return this.request<T>("OPTIONS", path);
  }

  public async request<T extends Record<string, unknown> = Record<string, unknown>>(
    method: HttpMethodType,
    path: string,
    data?: unknown,
  ): Promise<ResponseDataType<T>> {
    const fullURL = this.buildURL(path);
    const requestOptions = this.buildRequestOptions(method, data);
    const response = await fetch(fullURL, requestOptions);

    try {
      return await response.json();
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Failed to parse JSON response");
    }
  }

  public async upload<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    file: File | Blob,
    name = "file",
  ): Promise<ResponseDataType<T>> {
    const formData = new FormData();
    formData.append(name, file);

    // Clear any existing Content-Type to let browser set multipart/form-data boundary
    const originalContentType = this.header.get("Content-Type");
    this.header.remove("Content-Type");

    const result = await this.request<T>("POST", path, formData);

    // Restore original Content-Type if it existed
    if (originalContentType) {
      this.header.set("Content-Type", originalContentType);
    }

    return result;
  }

  private buildURL(url: string): string {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }

    if (!this.baseURL) {
      return url;
    }

    const path = url.startsWith("/") ? url : `/${url}`;
    const baseURL = this.baseURL.endsWith("/") ? this.baseURL.slice(0, -1) : this.baseURL;

    return `${baseURL}${path}`;
  }

  private buildRequestOptions(method: string, data?: unknown): RequestInit {
    const headers = this.header.native;

    let body: BodyInit | undefined;

    if (data !== undefined && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      if (data instanceof FormData) {
        body = data;
        this.header.clearContentType();
      } else if (typeof data === "string") {
        body = data;
      } else if (data instanceof Blob || data instanceof ArrayBuffer) {
        body = data;
      } else {
        body = JSON.stringify(data);
        // Set Content-Type to application/json if not already set
        if (!this.header.has("Content-Type")) {
          this.header.setJson();
        }
      }
    }

    const requestOptions: RequestInit = {
      method,
      headers,
      ...(body !== undefined && { body }),
      signal: this.abortController.signal,
    };

    return requestOptions;
  }
}
