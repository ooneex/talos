# @talosjs/http-request-file

Multipart file upload handler with MIME type validation, size constraints, and temporary file management for HTTP request processing.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **File Wrapper** - Enhanced File API wrapper with additional utilities

✅ **Type-Safe** - Full TypeScript support with proper type definitions

✅ **MIME Type Detection** - Built-in MIME type detection and validation

✅ **Multiple Read Methods** - Support for ArrayBuffer, Stream, and Text reading

✅ **File Properties** - Rich file metadata including size, type, and extension

✅ **Automatic Naming** - Generates unique filenames and normalizes original names

✅ **Cross-Platform** - Works in Browser, Node.js, Bun, and Deno

✅ **File I/O Operations** - Built-in file writing capabilities

✅ **Format Detection** - Automatic detection of images, videos, documents, and more

## Installation

```bash
bun add @talosjs/http-request-file
```

## Usage

### Basic Usage

```typescript
import { RequestFile } from '@talosjs/http-request-file';

// Create from a native File object (e.g., from form upload)
const nativeFile = new File(['Hello, world!'], 'example.txt', { type: 'text/plain' });
const requestFile = new RequestFile(nativeFile);

// Access file properties
console.log(requestFile.id); // Unique 25-character ID
console.log(requestFile.name); // Generated name: "abc123def456ghi789jkl012.txt"
console.log(requestFile.originalName); // Normalized: "example.txt"
console.log(requestFile.type); // "text/plain"
console.log(requestFile.size); // File size in bytes
console.log(requestFile.extension); // "txt"

// Check file types
console.log(requestFile.isText); // true
console.log(requestFile.isImage); // false
console.log(requestFile.isPdf); // false
```

### File Reading Operations

```typescript
import { RequestFile } from '@talosjs/http-request-file';

const imageFile = new File([/* binary data */], 'photo.jpg', { type: 'image/jpeg' });
const requestFile = new RequestFile(imageFile);

// Read as text (for text files)
const textContent = await requestFile.readAsText();
console.log(textContent);

// Read as ArrayBuffer (for binary files)
const buffer = await requestFile.readAsArrayBuffer();
console.log(new Uint8Array(buffer));

// Read as stream (for large files)
const stream = requestFile.readAsStream();
const reader = stream.getReader();
const { value, done } = await reader.read();
```

### File Type Detection

```typescript
import { RequestFile } from '@talosjs/http-request-file';

// Image file
const imageFile = new File([/* data */], 'photo.png', { type: 'image/png' });
const imageRequest = new RequestFile(imageFile);
console.log(imageRequest.isImage); // true
console.log(imageRequest.isSvg); // false

// Document file
const pdfFile = new File([/* data */], 'document.pdf', { type: 'application/pdf' });
const pdfRequest = new RequestFile(pdfFile);
console.log(pdfRequest.isPdf); // true
console.log(pdfRequest.isText); // false

// Excel file
const excelFile = new File([/* data */], 'spreadsheet.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});
const excelRequest = new RequestFile(excelFile);
console.log(excelRequest.isExcel); // true
```

### File Writing

```typescript
import { RequestFile } from '@talosjs/http-request-file';

const file = new File(['File content'], 'example.txt', { type: 'text/plain' });
const requestFile = new RequestFile(file);

// Write file to disk (Bun/Node.js)
await requestFile.write('./uploads/saved-file.txt');
```

### Advanced Usage

```typescript
import { RequestFile } from '@talosjs/http-request-file';

// Handle form upload
function handleFileUpload(files: FileList) {
  Array.from(files).forEach(file => {
    const requestFile = new RequestFile(file);

    console.log(`Processing: ${requestFile.originalName}`);
    console.log(`Size: ${requestFile.size} bytes`);
    console.log(`Type: ${requestFile.type}`);

    // Process based on file type
    if (requestFile.isImage) {
      console.log('Processing image file');
      // Handle image processing
    } else if (requestFile.isPdf) {
      console.log('Processing PDF document');
      // Handle PDF processing
    } else if (requestFile.isExcel || requestFile.isCsv) {
      console.log('Processing spreadsheet');
      // Handle spreadsheet processing
    }
  });
}

// Batch processing with concurrent operations
async function processBatch(files: File[]) {
  const requestFiles = files.map(file => new RequestFile(file));

  // Process text files
  const textFiles = requestFiles.filter(rf => rf.isText);
  const textContents = await Promise.all(
    textFiles.map(rf => rf.readAsText())
  );

  // Process image files
  const imageFiles = requestFiles.filter(rf => rf.isImage);
  const imageBuffers = await Promise.all(
    imageFiles.map(rf => rf.readAsArrayBuffer())
  );

  return { textContents, imageBuffers };
}
```

## API Reference

### `RequestFile` Class

The main class for wrapping native File objects with enhanced functionality.

#### Constructor

```typescript
constructor(native: File)
```

Creates a new RequestFile instance from a native File object.

**Parameters:**
- `native` - The native File object to wrap

#### Properties

##### `id: string` (readonly)
Unique 25-character identifier for the file.

##### `name: string` (readonly)
Generated filename using the unique ID and original extension.
**Format:** `{id}.{extension}`

##### `originalName: string` (readonly)
Original filename converted to kebab-case with extension preserved.

##### `type: MimeType` (readonly)
MIME type of the file (charset parameters removed).

##### `size: number` (readonly)
File size in bytes.

##### `extension: string` (readonly)
File extension in lowercase.

##### File Type Detection Properties

All properties return `boolean` values:

- `isImage` - Detects image files (PNG, JPEG, GIF, WebP, etc.)
- `isSvg` - Detects SVG images specifically
- `isVideo` - Detects video files (MP4, WebM, AVI, etc.)
- `isAudio` - Detects audio files (MP3, WAV, OGG, etc.)
- `isPdf` - Detects PDF documents
- `isText` - Detects text-based files
- `isExcel` - Detects Excel/spreadsheet files
- `isCsv` - Detects CSV files
- `isJson` - Detects JSON files
- `isXml` - Detects XML files
- `isHtml` - Detects HTML files

#### Methods

##### `readAsArrayBuffer(): Promise<ArrayBuffer>`
Reads the file content as an ArrayBuffer.

**Returns:** Promise that resolves to an ArrayBuffer containing the file data.

**Example:**
```typescript
const buffer = await requestFile.readAsArrayBuffer();
const uint8Array = new Uint8Array(buffer);
```

##### `readAsStream(): ReadableStream<Uint8Array>`
Returns a readable stream of the file content.

**Returns:** ReadableStream for streaming file data.

**Example:**
```typescript
const stream = requestFile.readAsStream();
const reader = stream.getReader();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log('Chunk:', value);
}
```

##### `readAsText(): Promise<string>`
Reads the file content as a text string.

**Returns:** Promise that resolves to the file content as a string.

**Example:**
```typescript
const text = await requestFile.readAsText();
console.log(text);
```

##### `write(path: string): Promise<void>`
Writes the file to the specified path on disk.

**Parameters:**
- `path` - The file system path where to write the file

**Returns:** Promise that resolves when the file is written.

**Example:**
```typescript
await requestFile.write('./uploads/my-file.txt');
```

### Interface

#### `IRequestFile`
Interface defining all available properties and methods for request files.

```typescript
interface IRequestFile {
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
  readAsArrayBuffer(): Promise<ArrayBuffer>;
  readAsStream(): ReadableStream<Uint8Array>;
  readAsText(): Promise<string>;
  write(path: string): Promise<void>;
}
```

## Use Cases

### File Upload Handler

```typescript
import { RequestFile } from '@talosjs/http-request-file';

async function handleUpload(formData: FormData) {
  const file = formData.get('file') as File;
  if (!file) return;

  const requestFile = new RequestFile(file);

  // Validate file type
  if (!requestFile.isImage && !requestFile.isPdf) {
    throw new Error('Only images and PDFs are allowed');
  }

  // Generate safe filename
  const safePath = `./uploads/${requestFile.name}`;

  // Save to disk
  await requestFile.write(safePath);

  return {
    id: requestFile.id,
    originalName: requestFile.originalName,
    size: requestFile.size,
    type: requestFile.type,
    saved: safePath
  };
}
```

### Image Processing Pipeline

```typescript
import { RequestFile } from '@talosjs/http-request-file';

async function processImageBatch(files: File[]) {
  const results = [];

  for (const file of files) {
    const requestFile = new RequestFile(file);

    if (requestFile.isImage && !requestFile.isSvg) {
      // Process raster images
      const buffer = await requestFile.readAsArrayBuffer();
      // ... process with image library

      results.push({
        id: requestFile.id,
        type: 'raster',
        processed: true
      });
    } else if (requestFile.isSvg) {
      // Process SVG images
      const svg = await requestFile.readAsText();
      // ... process SVG content

      results.push({
        id: requestFile.id,
        type: 'svg',
        processed: true
      });
    }
  }

  return results;
}
```

### Document Analysis

```typescript
import { RequestFile } from '@talosjs/http-request-file';

async function analyzeDocuments(files: File[]) {
  const analysis = {
    documents: 0,
    spreadsheets: 0,
    images: 0,
    other: 0,
    totalSize: 0
  };

  for (const file of files) {
    const requestFile = new RequestFile(file);
    analysis.totalSize += requestFile.size;

    if (requestFile.isPdf) {
      analysis.documents++;
    } else if (requestFile.isExcel || requestFile.isCsv) {
      analysis.spreadsheets++;
    } else if (requestFile.isImage) {
      analysis.images++;
    } else {
      analysis.other++;
    }
  }

  return analysis;
}
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun test tests`
4. Build the project: `bun run build` (from the package dir)

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

Made with ❤️ by the Talos team
