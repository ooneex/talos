import { basename, join } from "node:path";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import * as BunnyStorageSDK from "@bunny.net/storage-sdk";
import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import type { BunFile, S3File } from "bun";
import { decorator } from "./decorators";
import { putDirRecursive } from "./putDir";
import { StorageException } from "./StorageException";
import type { GetFileOptionsType, IStorage, PutDirOptionsType } from "./types";

type BunnyRegionType = "de" | "uk" | "ny" | "la" | "sg" | "se" | "br" | "jh" | "syd";

const REGION_MAP: Record<BunnyRegionType, BunnyStorageSDK.regions.StorageRegion> = {
  de: BunnyStorageSDK.regions.StorageRegion.Falkenstein,
  uk: BunnyStorageSDK.regions.StorageRegion.London,
  ny: BunnyStorageSDK.regions.StorageRegion.NewYork,
  la: BunnyStorageSDK.regions.StorageRegion.LosAngeles,
  sg: BunnyStorageSDK.regions.StorageRegion.Singapore,
  se: BunnyStorageSDK.regions.StorageRegion.Stockholm,
  br: BunnyStorageSDK.regions.StorageRegion.SaoPaulo,
  jh: BunnyStorageSDK.regions.StorageRegion.Johannesburg,
  syd: BunnyStorageSDK.regions.StorageRegion.Sydney,
};

@decorator.storage()
export class BunnyStorage implements IStorage {
  private bucket = "";
  private readonly storageZone: BunnyStorageSDK.zone.StorageZone;

  constructor(@inject(AppEnv) private readonly env: AppEnv) {
    const accessKey = this.env.STORAGE_BUNNY_ACCESS_KEY;
    const storageZone = this.env.STORAGE_BUNNY_STORAGE_ZONE;
    const region = this.env.STORAGE_BUNNY_REGION as BunnyRegionType | undefined;

    if (!accessKey) {
      throw new StorageException(
        "Bunny access key is required. Please provide an access key either through the constructor options or set the STORAGE_BUNNY_ACCESS_KEY environment variable.",
        "API_KEY_REQUIRED",
      );
    }
    if (!storageZone) {
      throw new StorageException(
        "Bunny storage zone is required. Please provide a storage zone either through the constructor options or set the STORAGE_BUNNY_STORAGE_ZONE environment variable.",
        "STORAGE_ZONE_REQUIRED",
      );
    }

    const sdkRegion = REGION_MAP[region ?? "de"];
    this.storageZone = BunnyStorageSDK.zone.connect_with_accesskey(sdkRegion, storageZone, accessKey);
  }

  public getBucket(): string {
    return this.bucket;
  }

  public setBucket(name: string): this {
    this.bucket = name;

    return this;
  }

  public async list(): Promise<string[]> {
    const path = this.bucket ? `/${this.bucket}/` : "/";

    try {
      const files = await BunnyStorageSDK.file.list(this.storageZone, path);

      return files.filter((file) => !file.isDirectory).map((file) => file.objectName);
    } catch (error) {
      throw new StorageException(
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_LIST_FAILED",
        {
          path,
        },
      );
    }
  }

  public async clearBucket(): Promise<this> {
    const keys = await this.list();

    await Promise.all(keys.map((key) => this.delete(key)));

    return this;
  }

  /**
   * Whether an object is filed under the key. This asks for a single byte rather than going
   * through the SDK's `file.get`, which describes an object with a `DESCRIBE` request: Bun's
   * fetch does not carry that verb to the wire, so the call comes back as an ordinary `GET` and
   * the SDK buffers the whole object trying to parse it as metadata. An existence check on a
   * video then downloads the video — gigabytes of resident memory for a yes-or-no answer, and a
   * failure once the parse chokes on the bytes, which reads back as "no such object". The range
   * header keeps the answer to one byte whatever the object weighs.
   */
  public async exists(key: string): Promise<boolean> {
    const [header, accessKey] = BunnyStorageSDK.zone.key(this.storageZone);
    const url = new URL(BunnyStorageSDK.zone.addr(this.storageZone));

    url.pathname = `${url.pathname}${this.buildFilePath(key)}`;

    try {
      const response = await fetch(url, { headers: { [header]: accessKey, Range: "bytes=0-0" } });

      await response.body?.cancel();

      return response.ok;
    } catch {
      return false;
    }
  }

  public async delete(key: string): Promise<void> {
    try {
      await BunnyStorageSDK.file.remove(this.storageZone, this.buildFilePath(key));
    } catch {
      // Ignore errors (file may not exist)
    }
  }

  public async putFile(key: string, localPath: string): Promise<number> {
    const file = Bun.file(localPath);

    return await this.put(key, file);
  }

  public async putDir(bucket: string, options: PutDirOptionsType): Promise<number> {
    return await putDirRecursive(this, bucket, options);
  }

  public async put(
    key: string,
    content: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer | Request | Response | BunFile | S3File | Blob,
  ): Promise<number> {
    const { stream, length } = await this.toReadableStream(content);
    const filePath = this.buildFilePath(key);

    try {
      await BunnyStorageSDK.file.upload(
        this.storageZone,
        filePath,
        stream as unknown as NodeReadableStream<Uint8Array>,
      );
    } catch (error) {
      throw new StorageException(
        `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_UPLOAD_FAILED",
        {
          key,
        },
      );
    }

    return length;
  }

  public async getFile(key: string, options: GetFileOptionsType): Promise<number> {
    const arrayBuffer = await this.getAsArrayBuffer(key);
    const filename = options.filename ?? basename(key);
    const localPath = join(options.outputDir, filename);

    return await Bun.write(localPath, arrayBuffer);
  }

  public async getAsJson<T = unknown>(key: string): Promise<T> {
    try {
      const { stream } = await BunnyStorageSDK.file.download(this.storageZone, this.buildFilePath(key));

      return await new Response(stream as unknown as BodyInit).json();
    } catch (error) {
      throw new StorageException(
        `Failed to get file as JSON: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_DOWNLOAD_FAILED",
        { key },
      );
    }
  }

  public async getAsArrayBuffer(key: string): Promise<ArrayBuffer> {
    try {
      const { stream } = await BunnyStorageSDK.file.download(this.storageZone, this.buildFilePath(key));

      return await new Response(stream as unknown as BodyInit).arrayBuffer();
    } catch (error) {
      throw new StorageException(
        `Failed to get file as ArrayBuffer: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_DOWNLOAD_FAILED",
        { key },
      );
    }
  }

  public getAsStream(key: string): ReadableStream {
    const filePath = this.buildFilePath(key);

    const { readable, writable } = new TransformStream();

    BunnyStorageSDK.file
      .download(this.storageZone, filePath)
      .then(({ stream }) => {
        (stream as unknown as ReadableStream).pipeTo(writable);
      })
      .catch((error) => {
        writable.abort(
          new StorageException(
            `Failed to get file as stream: ${error instanceof Error ? error.message : String(error)}`,
            "STORAGE_DOWNLOAD_FAILED",
            { key },
          ),
        );
      });

    return readable;
  }

  private buildFilePath(key: string): string {
    return this.bucket ? `/${this.bucket}/${key}` : `/${key}`;
  }

  private async toReadableStream(
    content: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer | Request | Response | BunFile | S3File | Blob,
  ): Promise<{ stream: ReadableStream<Uint8Array>; length: number }> {
    if (typeof content === "string") {
      const encoded = new TextEncoder().encode(content);
      return { stream: new Blob([encoded]).stream(), length: encoded.length };
    }

    if (content instanceof ArrayBuffer) {
      return { stream: new Blob([content]).stream(), length: content.byteLength };
    }

    if (content instanceof SharedArrayBuffer) {
      const uint8Array = new Uint8Array(content);
      const copied = new Uint8Array(uint8Array.length);
      copied.set(uint8Array);
      return { stream: new Blob([copied]).stream(), length: content.byteLength };
    }

    if (ArrayBuffer.isView(content)) {
      const view = new Uint8Array(content.buffer as ArrayBuffer, content.byteOffset, content.byteLength);
      return { stream: new Blob([view]).stream(), length: content.byteLength };
    }

    if (content instanceof Blob) {
      return { stream: content.stream(), length: content.size };
    }

    if (content instanceof Request || content instanceof Response) {
      const arrayBuffer = await content.arrayBuffer();
      return { stream: new Blob([arrayBuffer]).stream(), length: arrayBuffer.byteLength };
    }

    if (typeof content === "object" && content !== null && "arrayBuffer" in content) {
      const fileContent = content as BunFile | S3File;
      const arrayBuffer = await fileContent.arrayBuffer();
      return { stream: new Blob([arrayBuffer]).stream(), length: arrayBuffer.byteLength };
    }

    throw new StorageException("Unsupported content type for upload", "UNSUPPORTED_CONTENT_TYPE");
  }
}
