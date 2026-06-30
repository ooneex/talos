import { Mime, type MimeType } from "@talosjs/http-mimes";
import { random } from "@talosjs/utils/random";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import type { IRequestFile } from "./types";

const mime = new Mime();

export class RequestFile implements IRequestFile {
  public readonly id: string;
  public readonly name: string;
  public readonly originalName: string;
  public readonly type: MimeType;
  public readonly size: number;
  public readonly extension: string;
  public readonly isImage: boolean;
  public readonly isSvg: boolean;
  public readonly isVideo: boolean;
  public readonly isAudio: boolean;
  public readonly isPdf: boolean;
  public readonly isText: boolean;
  public readonly isExcel: boolean;
  public readonly isCsv: boolean;
  public readonly isJson: boolean;
  public readonly isXml: boolean;
  public readonly isHtml: boolean;

  constructor(private readonly native: File) {
    const match = this.native.name.match(/\.([0-9a-z]+)$/i);
    this.extension = (match ? match[1] : "")?.toLowerCase() || "";
    this.originalName = toKebabCase(this.native.name.replace(/\.[0-9a-z]*$/i, ""));
    this.originalName = `${this.originalName}.${this.extension}`;
    this.type = this.native.type.replace(/\s*;.*$/, "") as MimeType;
    this.size = this.native.size;
    this.id = random.nanoid(25);
    this.name = `${this.id}.${this.extension}`;

    const typeAsString = this.type as string;

    this.isImage = mime.isImage(typeAsString);
    this.isSvg = mime.isSvg(typeAsString);
    this.isVideo = mime.isVideo(typeAsString);
    this.isAudio = mime.isAudio(typeAsString);
    this.isPdf = mime.isPdf(typeAsString);
    this.isText = mime.isText(typeAsString);
    this.isExcel = mime.isExcel(typeAsString);
    this.isCsv = mime.isCsv(typeAsString);
    this.isJson = mime.isJson(typeAsString);
    this.isXml = mime.isXml(typeAsString);
    this.isHtml = mime.isHtml(typeAsString);
  }

  public async readAsArrayBuffer(): Promise<ArrayBuffer> {
    return await this.native.arrayBuffer();
  }

  public readAsStream(): ReadableStream<Uint8Array> {
    return this.native.stream();
  }

  public async readAsText(): Promise<string> {
    return await this.native.text();
  }

  public async write(path: string): Promise<void> {
    await Bun.write(path, this.native);
  }
}
