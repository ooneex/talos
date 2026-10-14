import type { Header } from "@talosjs/http-header";
import type { MimeType } from "@talosjs/http-mimes";
import type { ResponseDataType } from "@talosjs/http-response";
import type { HttpMethodType } from "@talosjs/types";

export type FetcherRequestOptionsType = {
  /** Cancels this request alone, where `abort()` cancels every request the fetcher has in flight. */
  signal?: AbortSignal;
};

export interface IFetcher {
  readonly header: Header;

  setBearerToken(token: string): IFetcher;
  setBasicToken(token: string): IFetcher;
  clearBearerToken(): IFetcher;
  clearBasicToken(): IFetcher;
  setContentType(contentType: MimeType): IFetcher;
  setLang(lang: string): IFetcher;
  abort(): IFetcher;
  clone(): IFetcher;

  get<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    options?: FetcherRequestOptionsType,
  ): Promise<ResponseDataType<T>>;
  post<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    data?: unknown,
    options?: FetcherRequestOptionsType,
  ): Promise<ResponseDataType<T>>;
  put<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    data?: unknown,
    options?: FetcherRequestOptionsType,
  ): Promise<ResponseDataType<T>>;
  patch<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    data?: unknown,
    options?: FetcherRequestOptionsType,
  ): Promise<ResponseDataType<T>>;
  delete<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    options?: FetcherRequestOptionsType,
  ): Promise<ResponseDataType<T>>;
  head<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    options?: FetcherRequestOptionsType,
  ): Promise<ResponseDataType<T>>;
  options<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    options?: FetcherRequestOptionsType,
  ): Promise<ResponseDataType<T>>;
  request<T extends Record<string, unknown> = Record<string, unknown>>(
    method: HttpMethodType,
    path: string,
    data?: unknown,
    options?: FetcherRequestOptionsType,
  ): Promise<ResponseDataType<T>>;
  upload<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    file: File | Blob,
    name?: string,
    options?: FetcherRequestOptionsType,
  ): Promise<ResponseDataType<T>>;
}
