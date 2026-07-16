---
name: storage-create
description: Generate a new storage class with its test file, then complete the generated code.
when_to_use: Use when creating a new S3-compatible storage adapter that extends Storage from @talosjs/storage.
model: sonnet
effort: low
allowed-tools: Bash(talos storage:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Storage Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

Generate a storage class and test file, then complete the implementation. Follow the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, conventions); this covers only the storage-specific parts.

**Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (once extracted into a shared package). Check both roots before assuming a path is missing; every `modules/<module>/...` path applies equally under `packages/<module>/...`.

## Steps

### 1. Infer the options from the request, then run the generator

```bash
talos storage:create --name=<name> --module=<module>
```

- `--name` — storage class name, from what is stored ("storage for user avatars" → `UserAvatar`). Any casing; the CLI normalizes to PascalCase and appends the `Storage` suffix, so omit the suffix.

### 2. Complete the storage class

Read `modules/<module>/src/storage/<Name>Storage.ts`, then:

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

Read and replace `modules/<module>/tests/storage/<Name>Storage.spec.ts`.

**Coverage:** class identity (`name.endsWith("Storage")`, is constructor), throws `StorageException` when any required credential is missing, constructs with all credentials, `getOptions` exists and returns an object with `accessKeyId`/`secretAccessKey`/`endpoint`/`bucket`/`region` reflecting the credentials, non-empty `bucket`, defaults `region` to `"auto"`, instance isolation.

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
  test("class name ends with 'Storage' and is a constructor", () => {
    expect(<Name>Storage.name.endsWith("Storage")).toBe(true);
    expect(typeof <Name>Storage).toBe("function");
  });

  test("throws StorageException when a required credential is missing", () => {
    expect(() => new <Name>Storage({ secretKey: "s", endpoint: "https://s3.example.com" })).toThrow(StorageException);
    expect(() => new <Name>Storage({ accessKey: "a", endpoint: "https://s3.example.com" })).toThrow(StorageException);
    expect(() => new <Name>Storage({ accessKey: "a", secretKey: "s" })).toThrow(StorageException);
  });

  test("constructs and exposes getOptions with all S3 keys reflecting the credentials", () => {
    const storage = new <Name>Storage(VALID_OPTIONS);
    expect(typeof storage.getOptions).toBe("function");
    const opts = storage.getOptions();
    expect(opts.accessKeyId).toBe(VALID_OPTIONS.accessKey);
    expect(opts.secretAccessKey).toBe(VALID_OPTIONS.secretKey);
    expect(opts.endpoint).toBe(VALID_OPTIONS.endpoint);
    expect(opts.region).toBe(VALID_OPTIONS.region);
    expect(typeof opts.bucket).toBe("string");
    expect((opts.bucket as string).length).toBeGreaterThan(0);
  });

  test("'getOptions' defaults region to 'auto' when not provided", () => {
    const storage = new <Name>Storage({ accessKey: "a", secretKey: "s", endpoint: "https://s3.example.com" });
    expect(storage.getOptions().region).toBe("auto");
  });

  test("should produce independent instances", () => {
    expect(new <Name>Storage(VALID_OPTIONS)).not.toBe(new <Name>Storage(VALID_OPTIONS));
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
