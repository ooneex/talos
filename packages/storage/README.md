# @talosjs/storage

File storage abstraction supporting local filesystem and cloud providers -- upload, download, list, and manage files with a unified bucket-based API.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Multiple Backends** - Support for local filesystem, Cloudflare R2, and Bunny CDN via a shared abstract `Storage` base class

✅ **Unified Interface** - Consistent `IStorage` API across all storage providers

✅ **Bucket Management** - Organize files into buckets with `getBucket`/`setBucket` methods

✅ **Directory Upload** - Upload entire directories recursively with optional regex filtering via `putDir`

✅ **File Download** - Download files from storage to local filesystem with `getFile`

✅ **Streaming Support** - Read files as streams for memory-efficient processing

✅ **JSON Support** - Store and retrieve JSON data directly with `getAsJson`

✅ **Container Integration** - Built-in decorator for dependency injection registration

✅ **Type-Safe** - Full TypeScript support with proper type definitions

## Installation

```bash
bun add @talosjs/storage
```

## Usage

### Filesystem Storage

```typescript
import { FilesystemStorage } from '@talosjs/storage';

const storage = new FilesystemStorage({
  basePath: './uploads'
});

// Set the bucket (directory)
storage.setBucket('images');

// Store a file
await storage.putFile('photo.jpg', '/path/to/local/photo.jpg');

// Store content directly
await storage.put('document.txt', 'Hello, World!');

// Check if file exists
const exists = await storage.exists('photo.jpg');
console.log(exists); // true

// Get file as JSON
const data = await storage.getAsJson<{ name: string }>('config.json');

// Get file as ArrayBuffer
const buffer = await storage.getAsArrayBuffer('photo.jpg');

// Get file as stream
const stream = storage.getAsStream('video.mp4');

// List all files in bucket
const files = await storage.list();
console.log(files); // ['photo.jpg', 'document.txt', ...]

// Delete a file
await storage.delete('document.txt');

// Clear entire bucket
await storage.clearBucket();
```

### Cloudflare R2 Storage

```typescript
import { CloudflareStorage } from '@talosjs/storage';

const storage = new CloudflareStorage({
  accountId: 'your-account-id',
  accessKeyId: 'your-access-key-id',
  secretAccessKey: 'your-secret-access-key',
  bucket: 'my-bucket'
});

// Upload a file
await storage.put('uploads/image.png', imageBuffer);

// Get file content
const content = await storage.getAsArrayBuffer('uploads/image.png');
```

### Bunny CDN Storage

```typescript
import { BunnyStorage } from '@talosjs/storage';

const storage = new BunnyStorage({
  apiKey: 'your-bunny-api-key',
  storageZone: 'your-storage-zone',
  region: 'ny' // Optional: ny, la, sg, etc.
});

storage.setBucket('assets');

// Upload file
await storage.putFile('styles.css', './dist/styles.css');

// List files
const files = await storage.list();
```

### Using Environment Variables

```typescript
import { CloudflareStorage } from '@talosjs/storage';

// Automatically uses environment variables
const storage = new CloudflareStorage();

// Environment variables:
// STORAGE_CLOUDFLARE_ACCOUNT_ID
// STORAGE_CLOUDFLARE_ACCESS_KEY_ID
// STORAGE_CLOUDFLARE_SECRET_ACCESS_KEY
// STORAGE_CLOUDFLARE_BUCKET
```

## API Reference

### Classes

#### `FilesystemStorage`

Local filesystem storage implementation.

**Constructor:**
```typescript
new FilesystemStorage(options?: { basePath?: string })
```

**Parameters:**
- `options.basePath` - Base directory for storage (default: current working directory)

---

#### `CloudflareStorage`

Cloudflare R2 object storage implementation.

**Constructor:**
```typescript
new CloudflareStorage(options?: CloudflareStorageOptions)
```

**Parameters:**
- `options.accountId` - Cloudflare account ID
- `options.accessKeyId` - R2 access key ID
- `options.secretAccessKey` - R2 secret access key
- `options.bucket` - Default bucket name

---

#### `BunnyStorage`

Bunny CDN storage implementation.

**Constructor:**
```typescript
new BunnyStorage(options?: BunnyStorageOptions)
```

**Parameters:**
- `options.apiKey` - Bunny API key
- `options.storageZone` - Storage zone name
- `options.region` - Storage region (optional)

---

### Interface Methods

All storage classes implement the `IStorage` interface:

##### `setBucket(name: string): IStorage`

Sets the current bucket/directory for operations.

**Parameters:**
- `name` - Bucket name

**Returns:** The storage instance for chaining

**Example:**
```typescript
storage.setBucket('images').setBucket('thumbnails');
```

##### `list(): Promise<string[]>`

Lists all files in the current bucket.

**Returns:** Array of file keys/paths

**Example:**
```typescript
const files = await storage.list();
console.log(files); // ['file1.txt', 'file2.jpg', ...]
```

##### `exists(key: string): Promise<boolean>`

Checks if a file exists.

**Parameters:**
- `key` - File key/path

**Returns:** `true` if file exists

**Example:**
```typescript
if (await storage.exists('config.json')) {
  const config = await storage.getAsJson('config.json');
}
```

##### `put(key: string, content: ContentType): Promise<number>`

Stores content at the specified key.

**Parameters:**
- `key` - File key/path
- `content` - Content to store (string, ArrayBuffer, Blob, etc.)

**Returns:** Number of bytes written

**Example:**
```typescript
const bytes = await storage.put('data.json', JSON.stringify({ foo: 'bar' }));
```

##### `putFile(key: string, localPath: string): Promise<number>`

Uploads a local file to storage.

**Parameters:**
- `key` - Destination key/path
- `localPath` - Path to local file

**Returns:** Number of bytes written

**Example:**
```typescript
await storage.putFile('uploads/photo.jpg', '/tmp/photo.jpg');
```

##### `getAsJson<T>(key: string): Promise<T>`

Retrieves and parses a file as JSON.

**Parameters:**
- `key` - File key/path

**Returns:** Parsed JSON object

**Example:**
```typescript
interface Config {
  apiUrl: string;
  debug: boolean;
}

const config = await storage.getAsJson<Config>('config.json');
```

##### `getAsArrayBuffer(key: string): Promise<ArrayBuffer>`

Retrieves a file as an ArrayBuffer.

**Parameters:**
- `key` - File key/path

**Returns:** File content as ArrayBuffer

##### `getAsStream(key: string): ReadableStream`

Gets a file as a readable stream.

**Parameters:**
- `key` - File key/path

**Returns:** ReadableStream for the file

**Example:**
```typescript
const stream = storage.getAsStream('large-file.zip');

// Pipe to response
return new Response(stream);
```

##### `delete(key: string): Promise<void>`

Deletes a file.

**Parameters:**
- `key` - File key/path

**Example:**
```typescript
await storage.delete('old-file.txt');
```

##### `clearBucket(): Promise<this>`

Removes all files from the current bucket.

**Returns:** The storage instance for chaining

**Example:**
```typescript
await storage.clearBucket();
```

### Types

#### `IStorage`

```typescript
interface IStorage {
  setBucket(name: string): IStorage;
  list(): Promise<string[]>;
  clearBucket(): Promise<this>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  putFile(key: string, localPath: string): Promise<number>;
  put(key: string, content: ContentType): Promise<number>;
  getAsJson<T = unknown>(key: string): Promise<T>;
  getAsArrayBuffer(key: string): Promise<ArrayBuffer>;
  getAsStream(key: string): ReadableStream;
}
```

#### `StorageClassType`

```typescript
type StorageClassType = new (...args: any[]) => IStorage;
```

## Advanced Usage

### Integration with Talos App

```typescript
import { App } from '@talosjs/app';
import { CloudflareStorage } from '@talosjs/storage';

const app = new App({
  storage: CloudflareStorage,
  // ... other config
});

await app.run();
```

### Using in Controllers

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/controller';

@Route.http({
  name: 'api.files.upload',
  path: '/api/files',
  method: 'POST',
  description: 'Upload a file'
})
class FileUploadController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { storage, files } = context;
    const file = files['document'];
    
    if (!file) {
      return context.response.exception('No file provided', { status: 400 });
    }
    
    storage?.setBucket('documents');
    const key = `${Date.now()}-${file.name}`;
    await storage?.putFile(key, file.path);
    
    return context.response.json({
      key,
      size: file.size,
      type: file.type
    });
  }
}
```

### Container Integration with Decorators

```typescript
import { container, EContainerScope } from '@talosjs/container';
import { CloudflareStorage, decorator } from '@talosjs/storage';

// Register with decorator
@decorator.storage()
class MyStorageService extends CloudflareStorage {
  constructor() {
    super();
    this.setBucket('my-app');
  }
}

// Resolve from container
const storage = container.get(MyStorageService);
```

### Error Handling

```typescript
import { CloudflareStorage, StorageException } from '@talosjs/storage';

try {
  const storage = new CloudflareStorage();
  const content = await storage.getAsJson('missing-file.json');
} catch (error) {
  if (error instanceof StorageException) {
    console.error('Storage Error:', error.message);
    console.error('Status:', error.status);
  }
}
```

### Streaming Large Files

```typescript
import { FilesystemStorage } from '@talosjs/storage';

const storage = new FilesystemStorage();
storage.setBucket('videos');

// Stream directly to HTTP response
const stream = storage.getAsStream('large-video.mp4');

return new Response(stream, {
  headers: {
    'Content-Type': 'video/mp4',
    'Content-Disposition': 'attachment; filename="video.mp4"'
  }
});
```

### Organizing Files with Buckets

```typescript
import { CloudflareStorage } from '@talosjs/storage';

const storage = new CloudflareStorage();

// Organize by content type
storage.setBucket('images/thumbnails');
await storage.put('photo-1.jpg', thumbnailData);

storage.setBucket('images/originals');
await storage.put('photo-1.jpg', originalData);

storage.setBucket('documents/invoices');
await storage.put('invoice-2024-001.pdf', pdfData);
```

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun run test`
4. Build the project: `bun run build`

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

Made with ❤️ by the Talos team
