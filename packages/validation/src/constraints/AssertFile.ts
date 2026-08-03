import type { MimeType } from "@talosjs/http-mimes";
import type { AssertType, ValidationResultType } from "../types";
import { Assert } from "../utils";
import { Validation } from "../Validation";

// MimeType widens to the whole array type, so only its string members are usable here
export type AssertFileMimeType = Extract<MimeType, string> | `${string}/*`;

export type AssertFileOptionsType = {
  minSize?: number;
  maxSize?: number;
  types?: AssertFileMimeType[];
  extensions?: string[];
  required?: boolean;
};

/**
 * Upload rules keyed by form field name
 */
export type AssertFileFieldsType = Record<string, AssertFileOptionsType>;

type FileInfoType = {
  type: string;
  size: number;
  extension: string;
};

const DEFAULT_MIN_SIZE: number = 1;

const isFileLike = (data: unknown): data is { name?: unknown; type: unknown; size: unknown } =>
  data !== null && typeof data === "object" && "size" in data && "type" in data;

const extractExtension = (name: string): string => {
  const match = name.match(/\.([0-9a-z]+)$/i);

  return match?.[1]?.toLowerCase() ?? "";
};

const toFileInfo = (data: unknown): FileInfoType | null => {
  if (!isFileLike(data)) {
    return null;
  }

  const { size, type } = data;

  if (typeof size !== "number" || Number.isNaN(size) || size < 0 || typeof type !== "string") {
    return null;
  }

  // RequestFile exposes `extension` directly, native File only carries a name,
  // and a Blob has neither
  const extension =
    "extension" in data && typeof data.extension === "string"
      ? data.extension.toLowerCase()
      : typeof data.name === "string"
        ? extractExtension(data.name)
        : "";

  return {
    type: type.replace(/\s*;.*$/, "").toLowerCase(),
    size,
    extension,
  };
};

const matchesType = (type: string, allowed: AssertFileMimeType): boolean => {
  const expected = allowed.toLowerCase();

  if (expected.endsWith("/*")) {
    return type.startsWith(expected.slice(0, -1));
  }

  return type === expected;
};

const formatSize = (size: number): string => `${size} bytes`;

/**
 * Validate uploaded files against per-field rules
 *
 * @example
 * ```ts
 * new AssertFile({
 *   avatar: { types: ["image/*"], maxSize: 2_000_000 },
 *   cv: { extensions: ["pdf"], required: false },
 * });
 * ```
 */
export class AssertFile extends Validation {
  constructor(private readonly fields: AssertFileFieldsType = {}) {
    super();
  }

  public getConstraint(): AssertType {
    const names = Object.keys(this.fields);

    if (names.length === 0) {
      return Assert("object");
    }

    return Object.fromEntries(names.map((name) => [name, Assert("object")]));
  }

  public getErrorMessage(): string | null {
    return null;
  }

  public override validate(data: unknown): ValidationResultType {
    if (data === null || typeof data !== "object") {
      return this.invalidResult("Files must be an object");
    }

    const files = data as Record<string, unknown>;

    for (const [name, options] of Object.entries(this.fields)) {
      const result = this.validateFile(files[name], options);

      if (!result.isValid) {
        return this.invalidResult(`"${name}": ${result.message}`);
      }
    }

    return this.validResult();
  }

  private validateFile(data: unknown, options: AssertFileOptionsType): ValidationResultType {
    if (data === undefined || data === null) {
      return options.required === false ? this.validResult() : this.invalidResult("File is required");
    }

    const file = toFileInfo(data);

    if (!file) {
      return this.invalidResult("Value must be a file");
    }

    return (
      this.validateSize(file, options) ??
      this.validateType(file, options) ??
      this.validateExtension(file, options) ??
      this.validResult()
    );
  }

  private validateSize(file: FileInfoType, options: AssertFileOptionsType): ValidationResultType | null {
    const { minSize = DEFAULT_MIN_SIZE, maxSize } = options;

    if (file.size < minSize) {
      return this.invalidResult(`File size must be at least ${formatSize(minSize)}`);
    }

    if (maxSize !== undefined && file.size > maxSize) {
      return this.invalidResult(`File size must not exceed ${formatSize(maxSize)}`);
    }

    return null;
  }

  private validateType(file: FileInfoType, options: AssertFileOptionsType): ValidationResultType | null {
    const { types } = options;

    if (!types || types.length === 0) {
      return null;
    }

    if (!types.some((allowed) => matchesType(file.type, allowed))) {
      return this.invalidResult(`File type "${file.type || "unknown"}" is not allowed (allowed: ${types.join(", ")})`);
    }

    return null;
  }

  private validateExtension(file: FileInfoType, options: AssertFileOptionsType): ValidationResultType | null {
    const { extensions } = options;

    if (!extensions || extensions.length === 0) {
      return null;
    }

    const allowed = extensions.map((extension) => extension.replace(/^\./, "").toLowerCase());

    if (!allowed.includes(file.extension)) {
      return this.invalidResult(
        `File extension "${file.extension || "unknown"}" is not allowed (allowed: ${allowed.join(", ")})`,
      );
    }

    return null;
  }
}
