---
name: storage-create
description: Generate a new storage class with its test file, then complete the generated code. Use when creating a new S3-compatible storage adapter that extends Storage from @talosjs/storage.
allowed-tools: Bash(talos storage:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Storage Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a storage class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the storage-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos storage:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the storage class name, taken from what is stored (e.g., "storage for user avatars" → `UserAvatar`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Storage` suffix automatically, so omit the suffix.

### 2. Complete the storage class

Read `modules/<module>/src/storage/<Name>Storage.ts`, then implement:

- Set the `bucket` property to the appropriate bucket name
- Verify env var names match project config (`STORAGE_<NAME_UPPER>_ACCESS_KEY`, `STORAGE_<NAME_UPPER>_SECRET_KEY`, `STORAGE_<NAME_UPPER>_ENDPOINT`, `STORAGE_<NAME_UPPER>_REGION`)

```typescript
import { Storage, decorator, StorageException } from "@talosjs/storage";
import { inject } from "@talosjs/container";
import { AppEnv } from "@talosjs/app-env";
import type { S3Options } from "bun";

@decorator.storage()
export class <Name>Storage extends Storage {
  protected bucket: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly endpoint: string;
  private readonly region: string;

  public constructor(
    @inject(AppEnv) private readonly env: AppEnv,
    options?: {
      accessKey?: string;
      secretKey?: string;
      endpoint?: string;
      region?: string;
    },
  ) {
    super();

    const accessKey = options?.accessKey || this.env.STORAGE_<NAME_UPPER>_ACCESS_KEY;
    const secretKey = options?.secretKey || this.env.STORAGE_<NAME_UPPER>_SECRET_KEY;
    const endpoint = options?.endpoint || this.env.STORAGE_<NAME_UPPER>_ENDPOINT;

    // ... validation throws StorageException if missing ...

    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.endpoint = endpoint;
    this.region = options?.region || this.env.STORAGE_<NAME_UPPER>_REGION || "auto";
  }

  public getOptions(): S3Options {
    return {
      accessKeyId: this.accessKey,
      secretAccessKey: this.secretKey,
      endpoint: this.endpoint,
      bucket: this.bucket,
      region: this.region,
    };
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/storage/<Name>Storage.spec.ts`:

**Coverage:** class identity (`name.endsWith("Storage")`, is constructor), throws `StorageException` when each required credential is missing, succeeds with all credentials, `getOptions` exists and returns object with `accessKeyId`/`secretAccessKey`/`endpoint`/`bucket`/`region`, reflects provided credentials, defaults region to `"auto"`, bucket is a non-empty string, instance isolation.

```typescript
import { StorageException } from "@talosjs/storage";
import { describe, expect, test } from "bun:test";
import { <Name>Storage } from "@/storage/<Name>Storage";

const VALID_OPTIONS = {
  accessKey: "test-access-key",
  secretKey: "test-secret-key",
  endpoint: "https://s3.example.com",
  region: "eu-west-1",
};

describe("<Name>Storage", () => {
  test("should have class name ending with 'Storage'", () => {
    expect(<Name>Storage.name.endsWith("Storage")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Storage).toBe("function");
  });

  test("should throw StorageException when accessKey is missing", () => {
    expect(() => new <Name>Storage({ secretKey: "s", endpoint: "https://s3.example.com" })).toThrow(StorageException);
  });

  test("should throw StorageException when secretKey is missing", () => {
    expect(() => new <Name>Storage({ accessKey: "a", endpoint: "https://s3.example.com" })).toThrow(StorageException);
  });

  test("should throw StorageException when endpoint is missing", () => {
    expect(() => new <Name>Storage({ accessKey: "a", secretKey: "s" })).toThrow(StorageException);
  });

  test("should construct successfully when all required credentials are provided", () => {
    expect(() => new <Name>Storage(VALID_OPTIONS)).not.toThrow();
  });

  test("should have 'getOptions' method", () => {
    expect(typeof <Name>Storage.prototype.getOptions).toBe("function");
  });

  test("'getOptions' should return an object with all required S3 keys", () => {
    const storage = new <Name>Storage(VALID_OPTIONS);
    const opts = storage.getOptions();
    expect(opts).toHaveProperty("accessKeyId");
    expect(opts).toHaveProperty("secretAccessKey");
    expect(opts).toHaveProperty("endpoint");
    expect(opts).toHaveProperty("bucket");
    expect(opts).toHaveProperty("region");
  });

  test("'getOptions' should reflect the provided credentials", () => {
    const storage = new <Name>Storage(VALID_OPTIONS);
    const opts = storage.getOptions();
    expect(opts.accessKeyId).toBe(VALID_OPTIONS.accessKey);
    expect(opts.secretAccessKey).toBe(VALID_OPTIONS.secretKey);
    expect(opts.endpoint).toBe(VALID_OPTIONS.endpoint);
    expect(opts.region).toBe(VALID_OPTIONS.region);
  });

  test("'getOptions' should default region to 'auto' when not provided", () => {
    const storage = new <Name>Storage({ accessKey: "a", secretKey: "s", endpoint: "https://s3.example.com" });
    expect(storage.getOptions().region).toBe("auto");
  });

  test("'getOptions' should include the bucket name", () => {
    const storage = new <Name>Storage(VALID_OPTIONS);
    const opts = storage.getOptions();
    expect(typeof opts.bucket).toBe("string");
    expect((opts.bucket as string).length).toBeGreaterThan(0);
  });

  test("should produce independent instances", () => {
    const a = new <Name>Storage(VALID_OPTIONS);
    const b = new <Name>Storage(VALID_OPTIONS);
    expect(a).not.toBe(b);
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
