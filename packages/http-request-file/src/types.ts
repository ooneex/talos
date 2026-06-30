import type { MimeType } from "@talosjs/http-mimes";

export interface IRequestFile {
  readonly id: string;
  readonly name: string;
  readonly originalName: string;
  readonly type: MimeType;
  readonly size: number;
  readonly extension: string;
  readonly isImage: boolean;
  readonly isVideo: boolean;
  readonly isAudio: boolean;
  readonly isPdf: boolean;
  readonly isText: boolean;
  readonly isExcel: boolean;
  readonly isCsv: boolean;
  readonly isJson: boolean;
  readonly isXml: boolean;
  readonly isHtml: boolean;
  readonly isSvg: boolean;
  readAsArrayBuffer: () => Promise<ArrayBuffer>;
  readAsStream: () => ReadableStream<Uint8Array>;
  readAsText: () => Promise<string>;
  write: (path: string) => Promise<void>;
}
