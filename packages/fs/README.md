# @talosjs/fs

Async file system utilities for reading, writing, copying, and watching files and directories with type-safe error handling and stream support. This package provides intuitive `File` and `Directory` classes for managing files and directories with proper error handling, streaming, and glob pattern matching.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **File Operations** - Read, write, append, copy, and delete files with ease

✅ **Directory Management** - Create, list, copy, move, and watch directories

✅ **Streaming Support** - Stream file contents as text, bytes, or JSON objects via async generators

✅ **Async/Await** - Full async support for all I/O operations

✅ **Type-Safe** - Full TypeScript support with `IFile` and `IDirectory` interfaces

✅ **Error Handling** - Dedicated `FileException` and `DirectoryException` classes

✅ **Pattern Matching** - Filter files and directories using regular expression patterns

✅ **File Watching** - Watch directories for changes with recursive support and event callbacks

✅ **Buffered Writing** - Efficient file writing via Bun's `FileSink` writer API

## Installation

```bash
bun add @talosjs/fs
```

## Usage

### File Operations

```typescript
import { File } from '@talosjs/fs';

// Create a file instance
const file = new File('/path/to/document.txt');

// Get file information
console.log(file.getName());      // "document.txt"
console.log(file.getPath());      // "/path/to/document.txt"
console.log(file.getExtension()); // "txt"
console.log(file.getDirectory()); // "/path/to"

// Check if file exists
if (await file.exists()) {
  console.log('File exists!');
}

// Read file contents
const text = await file.text();
const json = await file.json<{ name: string }>();
const bytes = await file.bytes();
const buffer = await file.arrayBuffer();

// Get file metadata
const size = file.getSize();  // Size in bytes
const type = file.getType();  // MIME type
```

### Writing Files

```typescript
import { File } from '@talosjs/fs';

const file = new File('/path/to/output.txt');

// Write string content
await file.write('Hello, World!');

// Write JSON data
await file.write(JSON.stringify({ name: 'John', age: 30 }));

// Write binary data
await file.write(new Uint8Array([72, 101, 108, 108, 111]));

// Append to file
await file.append('\nAdditional content');
```

### Streaming File Contents

```typescript
import { File } from '@talosjs/fs';

const file = new File('/path/to/large-file.txt');

// Stream as text chunks
for await (const chunk of file.streamAsText()) {
  console.log(chunk);
}

// Stream as raw bytes
const byteStream = file.stream();

// Stream JSON objects (for JSONL or JSON array files)
for await (const obj of file.streamAsJson<{ id: number }>()) {
  console.log(obj.id);
}
```

### File Writer

```typescript
import { File } from '@talosjs/fs';

const file = new File('/path/to/output.txt');

// Get a file writer for efficient writing
const writer = file.writer({ highWaterMark: 1024 * 1024 });

writer.write('Line 1\n');
writer.write('Line 2\n');
writer.write('Line 3\n');

await writer.end();
```

### Copy and Delete Files

```typescript
import { File } from '@talosjs/fs';

const source = new File('/path/to/source.txt');

// Copy to new location
await source.copy('/path/to/destination.txt');

// Delete the file
await source.delete();
```

### Download Files from URL

```typescript
import { File } from '@talosjs/fs';

const file = new File('/path/to/downloaded-image.jpg');

// Download from URL
await file.download('https://example.com/image.jpg');
```

### Directory Operations

```typescript
import { Directory } from '@talosjs/fs';

// Create a directory instance
const dir = new Directory('/path/to/folder');

// Get directory information
console.log(dir.getName());   // "folder"
console.log(dir.getPath());   // "/path/to/folder"
console.log(dir.getParent()); // "/path/to"

// Check if directory exists
if (await dir.exists()) {
  console.log('Directory exists!');
}

// Create directory (with parents if needed)
await dir.mkdir({ recursive: true, mode: 0o755 });

// Check if empty
const isEmpty = await dir.isEmpty();
```

### Listing Directory Contents

```typescript
import { Directory } from '@talosjs/fs';

const dir = new Directory('/path/to/folder');

// List all entries (files and directories)
const entries = await dir.ls();
console.log(entries); // ['file1.txt', 'file2.txt', 'subfolder']

// List with file types
const entriesWithTypes = await dir.lsWithTypes();
for (const entry of entriesWithTypes) {
  console.log(entry.name, entry.isFile() ? 'file' : 'directory');
}

// List recursively
const allEntries = await dir.ls({ recursive: true });
```

### Getting Files and Directories

```typescript
import { Directory } from '@talosjs/fs';

const dir = new Directory('/path/to/project');

// Get all files
const files = await dir.getFiles();
console.log(files); // ['src/index.ts', 'src/utils.ts', 'README.md']

// Get files with glob pattern
const tsFiles = await dir.getFiles({ pattern: '**/*.ts' });

// Get files recursively
const allFiles = await dir.getFiles({ recursive: true });

// Get all subdirectories
const directories = await dir.getDirectories();

// Get directories with pattern
const srcDirs = await dir.getDirectories({ pattern: 'src/*' });
```

### Copy and Move Directories

```typescript
import { Directory } from '@talosjs/fs';

const source = new Directory('/path/to/source');

// Copy directory recursively
await source.cp('/path/to/destination', {
  recursive: true,
  force: true
});

// Move/rename directory
await source.mv('/path/to/new-location');
```

### Delete Directory

```typescript
import { Directory } from '@talosjs/fs';

const dir = new Directory('/path/to/folder');

// Delete directory (must be empty by default)
await dir.rm();

// Delete recursively with force
await dir.rm({ recursive: true, force: true });
```

### Watch Directory for Changes

```typescript
import { Directory } from '@talosjs/fs';

const dir = new Directory('/path/to/watch');

// Watch for file changes
const watcher = dir.watch({ recursive: true });

for await (const event of watcher) {
  console.log(`${event.type}: ${event.filename}`);
}
```

### Navigate Directories

```typescript
import { Directory } from '@talosjs/fs';

const root = new Directory('/path/to/project');

// Navigate to subdirectory
const src = root.cd('src');
const lib = src.cd('lib');

console.log(lib.getPath()); // "/path/to/project/src/lib"
```

### Get Directory Size

```typescript
import { Directory } from '@talosjs/fs';

const dir = new Directory('/path/to/folder');

// Get total size of directory (recursive)
const size = await dir.getSize();
console.log(`Directory size: ${size} bytes`);
```

### Get Directory Stats

```typescript
import { Directory } from '@talosjs/fs';

const dir = new Directory('/path/to/folder');

const stats = await dir.stat();
console.log('Created:', stats.birthtime);
console.log('Modified:', stats.mtime);
console.log('Is Directory:', stats.isDirectory());
```

## API Reference

### Classes

#### `File`

Class for file operations.

**Constructor:**
```typescript
new File(path: string | URL, options?: FileOptionsType)
```

**Parameters:**
- `path` - File path as string or URL
- `options.type` - Custom MIME type (optional)

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `getPath()` | `string` | Get the file path |
| `getName()` | `string` | Get the file name with extension |
| `getExtension()` | `string` | Get the file extension (without dot) |
| `getDirectory()` | `string` | Get the parent directory path |
| `getSize()` | `number` | Get file size in bytes |
| `getType()` | `string` | Get MIME type |
| `exists()` | `Promise<boolean>` | Check if file exists |
| `text()` | `Promise<string>` | Read file as text |
| `json<T>()` | `Promise<T>` | Read and parse file as JSON |
| `arrayBuffer()` | `Promise<ArrayBuffer>` | Read file as ArrayBuffer |
| `bytes()` | `Promise<Uint8Array>` | Read file as Uint8Array |
| `stream()` | `ReadableStream` | Get readable byte stream |
| `streamAsText()` | `AsyncGenerator<string>` | Stream file as text chunks |
| `streamAsJson<T>()` | `AsyncGenerator<T>` | Stream file as JSON objects |
| `write(data)` | `Promise<void>` | Write data to file |
| `append(data)` | `Promise<void>` | Append data to file |
| `copy(destination)` | `Promise<void>` | Copy file to destination |
| `delete()` | `Promise<void>` | Delete the file |
| `download(url)` | `Promise<void>` | Download from URL to file |
| `writer(options?)` | `FileSink` | Get a file writer |

---

#### `Directory`

Class for directory operations.

**Constructor:**
```typescript
new Directory(path: string | URL)
```

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `getPath()` | `string` | Get directory path |
| `getName()` | `string` | Get directory name |
| `getParent()` | `string` | Get parent directory path |
| `exists()` | `Promise<boolean>` | Check if directory exists |
| `mkdir(options?)` | `Promise<void>` | Create the directory |
| `rm(options?)` | `Promise<void>` | Remove the directory |
| `ls(options?)` | `Promise<string[]>` | List directory contents |
| `lsWithTypes(options?)` | `Promise<Dirent[]>` | List with file type info |
| `cp(destination, options?)` | `Promise<void>` | Copy directory |
| `mv(destination)` | `Promise<void>` | Move/rename directory |
| `stat()` | `Promise<Stats>` | Get directory stats |
| `watch(options?)` | `FSWatcher` | Watch for changes |
| `isEmpty()` | `Promise<boolean>` | Check if directory is empty |
| `getSize()` | `Promise<number>` | Get total size recursively |
| `getFiles(options?)` | `Promise<string[]>` | Get all files |
| `getDirectories(options?)` | `Promise<string[]>` | Get all subdirectories |
| `cd(subpath)` | `Directory` | Navigate to subdirectory |

### Types

#### `FileOptionsType`

```typescript
type FileOptionsType = {
  type?: string; // MIME type
};
```

#### `FileWriteDataType`

```typescript
type FileWriteDataType = 
  | string 
  | Blob 
  | ArrayBufferLike 
  | ArrayBufferView 
  | BunFile
  | Response
  | ReadableStream;
```

#### `FileWriterOptionsType`

```typescript
type FileWriterOptionsType = {
  highWaterMark?: number;
};
```

#### `DirectoryCreateOptionsType`

```typescript
type DirectoryCreateOptionsType = {
  recursive?: boolean;
  mode?: number;
};
```

#### `DirectoryDeleteOptionsType`

```typescript
type DirectoryDeleteOptionsType = {
  recursive?: boolean;
  force?: boolean;
};
```

#### `DirectoryGetFilesOptionsType`

```typescript
type DirectoryGetFilesOptionsType = {
  recursive?: boolean;
  pattern?: string; // Glob pattern
};
```

### Exceptions

#### `FileException`

Thrown when file operations fail.

```typescript
import { File, FileException } from '@talosjs/fs';

try {
  const file = new File('/nonexistent/file.txt');
  await file.text();
} catch (error) {
  if (error instanceof FileException) {
    console.error('File error:', error.message);
    console.error('Path:', error.data.path);
  }
}
```

#### `DirectoryException`

Thrown when directory operations fail.

```typescript
import { Directory, DirectoryException } from '@talosjs/fs';

try {
  const dir = new Directory('/nonexistent/folder');
  await dir.ls();
} catch (error) {
  if (error instanceof DirectoryException) {
    console.error('Directory error:', error.message);
    console.error('Path:', error.data.path);
  }
}
```

## Advanced Usage

### Processing Large Files

```typescript
import { File } from '@talosjs/fs';

const file = new File('/path/to/large-file.jsonl');

// Process large JSON Lines file without loading into memory
let lineCount = 0;
for await (const record of file.streamAsJson<{ id: number; name: string }>()) {
  lineCount++;
  // Process each record individually
  await processRecord(record);
}

console.log(`Processed ${lineCount} records`);
```

### Recursive File Processing

```typescript
import { Directory, File } from '@talosjs/fs';

const projectDir = new Directory('/path/to/project');

// Find all TypeScript files and count lines
const tsFiles = await projectDir.getFiles({
  recursive: true,
  pattern: '**/*.ts'
});

let totalLines = 0;
for (const filePath of tsFiles) {
  const file = new File(projectDir.getPath() + '/' + filePath);
  const content = await file.text();
  totalLines += content.split('\n').length;
}

console.log(`Total lines of TypeScript: ${totalLines}`);
```

### File Backup System

```typescript
import { File, Directory } from '@talosjs/fs';

async function backupFiles(sourcePath: string, backupPath: string): Promise<void> {
  const sourceDir = new Directory(sourcePath);
  const backupDir = new Directory(backupPath);

  // Create backup directory
  await backupDir.mkdir({ recursive: true });

  // Copy all files
  const files = await sourceDir.getFiles({ recursive: true });
  
  for (const filePath of files) {
    const source = new File(`${sourcePath}/${filePath}`);
    await source.copy(`${backupPath}/${filePath}`);
  }
}
```

### Watch and Auto-Reload

```typescript
import { Directory } from '@talosjs/fs';

const configDir = new Directory('./config');

// Watch for configuration changes
const watcher = configDir.watch({ recursive: true });

for await (const event of watcher) {
  if (event.filename?.endsWith('.json')) {
    console.log(`Config changed: ${event.filename}`);
    await reloadConfiguration();
  }
}
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
