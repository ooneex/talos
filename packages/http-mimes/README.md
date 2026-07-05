# @talosjs/http-mimes

Complete MIME type registry with TypeScript constants and lookup utilities for HTTP content type negotiation and file type detection.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Complete MIME Type Registry** - Comprehensive collection of standard MIME type constants

✅ **Content Type Detection** - Methods for identifying JSON, HTML, CSS, JavaScript, XML, images, audio, video, fonts, and more

✅ **Document Detection** - Detect Word, Excel, PowerPoint, PDF, CSV, Markdown, and RTF formats

✅ **Media Detection** - Identify specific formats like JPEG, PNG, GIF, WebP, SVG, MP3, MP4

✅ **Form and Stream Detection** - Detect form data, multipart, blob, and stream MIME types

✅ **Type-Safe** - Full TypeScript support with `MimeType` union type for all valid MIME types

✅ **Case Insensitive** - Handles different case variations automatically

✅ **Zero Dependencies** - No external dependencies required

✅ **Cross-Platform** - Works in Browser, Node.js, Bun, and Deno

## Installation

```bash
bun add @talosjs/http-mimes
```

## Usage

### Basic Usage

```typescript
import { Mime } from '@talosjs/http-mimes';

const mime = new Mime();

// Check if a MIME type is JSON
console.log(mime.isJson('application/json')); // true
console.log(mime.isJson('application/hal+json')); // true

// Check if a MIME type is an image
console.log(mime.isImage('image/png')); // true
console.log(mime.isImage('image/jpeg')); // true

// Check if a MIME type is audio
console.log(mime.isAudio('audio/mpeg')); // true
console.log(mime.isAudio('audio/wav')); // true
```

### Advanced Usage

```typescript
import { Mime, MimeType } from '@talosjs/http-mimes';

const mime = new Mime();

// Handle different case variations
console.log(mime.isJson('APPLICATION/JSON')); // true
console.log(mime.isVideo('VIDEO/MP4')); // true

// Handle whitespace
console.log(mime.isPdf(' application/pdf ')); // true

// Check multiple formats
const contentTypes = [
  'application/json',
  'image/png',
  'video/mp4',
  'audio/mpeg'
];

contentTypes.forEach(type => {
  console.log(`${type}:`);
  console.log(`  Is JSON: ${mime.isJson(type)}`);
  console.log(`  Is Image: ${mime.isImage(type)}`);
  console.log(`  Is Video: ${mime.isVideo(type)}`);
  console.log(`  Is Audio: ${mime.isAudio(type)}`);
});
```

## API Reference

### `Mime` Class

The main class providing MIME type detection methods.

#### Methods

##### `isJson(mimeType: string): boolean`
Checks if a MIME type is JSON-related.

**Parameters:**
- `mimeType` - The MIME type to check

**Returns:** `true` if JSON-related, `false` otherwise

**Example:**
```typescript
mime.isJson('application/json'); // true
mime.isJson('application/hal+json'); // true
mime.isJson('text/html'); // false
```

##### `isAudio(mimeType: string): boolean`
Checks if a MIME type is audio-related.

**Example:**
```typescript
mime.isAudio('audio/mpeg'); // true
mime.isAudio('audio/wav'); // true
mime.isAudio('video/mp4'); // false
```

##### `isVideo(mimeType: string): boolean`
Checks if a MIME type is video-related.

**Example:**
```typescript
mime.isVideo('video/mp4'); // true
mime.isVideo('video/webm'); // true
mime.isVideo('audio/mpeg'); // false
```

##### `isImage(mimeType: string): boolean`
Checks if a MIME type is image-related.

**Example:**
```typescript
mime.isImage('image/png'); // true
mime.isImage('image/jpeg'); // true
mime.isImage('text/html'); // false
```

##### `isPdf(mimeType: string): boolean`
Checks if a MIME type is PDF.

**Example:**
```typescript
mime.isPdf('application/pdf'); // true
mime.isPdf('text/html'); // false
```

##### `isHtml(mimeType: string): boolean`
Checks if a MIME type is HTML.

**Example:**
```typescript
mime.isHtml('text/html'); // true
mime.isHtml('application/xhtml+xml'); // true
```

##### `isCss(mimeType: string): boolean`
Checks if a MIME type is CSS.

**Example:**
```typescript
mime.isCss('text/css'); // true
```

##### `isJavaScript(mimeType: string): boolean`
Checks if a MIME type is JavaScript.

**Example:**
```typescript
mime.isJavaScript('application/javascript'); // true
mime.isJavaScript('text/javascript'); // true
```

##### `isXml(mimeType: string): boolean`
Checks if a MIME type is XML-related.

**Example:**
```typescript
mime.isXml('application/xml'); // true
mime.isXml('text/xml'); // true
```

##### `isText(mimeType: string): boolean`
Checks if a MIME type is text-related.

**Example:**
```typescript
mime.isText('text/plain'); // true
mime.isText('text/html'); // true
```

##### `isFont(mimeType: string): boolean`
Checks if a MIME type is font-related.

**Example:**
```typescript
mime.isFont('font/woff'); // true
mime.isFont('font/woff2'); // true
```

##### `isZip(mimeType: string): boolean`
Checks if a MIME type is ZIP-related.

**Example:**
```typescript
mime.isZip('application/zip'); // true
```

##### `isMp4(mimeType: string): boolean`
Checks if a MIME type is MP4 video.

**Example:**
```typescript
mime.isMp4('video/mp4'); // true
mime.isMp4('video/mpeg'); // false
```

##### `isMp3(mimeType: string): boolean`
Checks if a MIME type is MP3 audio.

**Example:**
```typescript
mime.isMp3('audio/mpeg'); // true
mime.isMp3('audio/wav'); // false
```

##### `isSvg(mimeType: string): boolean`
Checks if a MIME type is SVG image.

**Example:**
```typescript
mime.isSvg('image/svg+xml'); // true
mime.isSvg('image/png'); // false
```

##### `isJpeg(mimeType: string): boolean`
Checks if a MIME type is JPEG image.

**Example:**
```typescript
mime.isJpeg('image/jpeg'); // true
mime.isJpeg('image/png'); // false
```

##### `isJpg(mimeType: string): boolean`
Alias for `isJpeg()`. Checks if a MIME type is JPEG image.

**Example:**
```typescript
mime.isJpg('image/jpeg'); // true
mime.isJpg('image/png'); // false
```

##### `isPng(mimeType: string): boolean`
Checks if a MIME type is PNG image.

**Example:**
```typescript
mime.isPng('image/png'); // true
mime.isPng('image/jpeg'); // false
```

##### `isGif(mimeType: string): boolean`
Checks if a MIME type is GIF image.

**Example:**
```typescript
mime.isGif('image/gif'); // true
mime.isGif('image/png'); // false
```

##### `isWebp(mimeType: string): boolean`
Checks if a MIME type is WebP image.

**Example:**
```typescript
mime.isWebp('image/webp'); // true
mime.isWebp('image/png'); // false
```

##### `isCsv(mimeType: string): boolean`
Checks if a MIME type is CSV.

**Example:**
```typescript
mime.isCsv('text/csv'); // true
mime.isCsv('application/csv'); // true
mime.isCsv('text/plain'); // false
```

##### `isOctetStream(mimeType: string): boolean`
Checks if a MIME type is binary stream.

**Example:**
```typescript
mime.isOctetStream('application/octet-stream'); // true
mime.isOctetStream('text/plain'); // false
```

##### `isWord(mimeType: string): boolean`
Checks if a MIME type is Microsoft Word document.

**Example:**
```typescript
mime.isWord('application/msword'); // true
mime.isWord('application/vnd.openxmlformats-officedocument.wordprocessingml.document'); // true
mime.isWord('application/pdf'); // false
```

##### `isExcel(mimeType: string): boolean`
Checks if a MIME type is Microsoft Excel document.

**Example:**
```typescript
mime.isExcel('application/vnd.ms-excel'); // true
mime.isExcel('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); // true
mime.isExcel('text/csv'); // false
```

##### `isPowerPoint(mimeType: string): boolean`
Checks if a MIME type is Microsoft PowerPoint document.

**Example:**
```typescript
mime.isPowerPoint('application/vnd.ms-powerpoint'); // true
mime.isPowerPoint('application/vnd.openxmlformats-officedocument.presentationml.presentation'); // true
mime.isPowerPoint('application/pdf'); // false
```

##### `isBlob(mimeType: string): boolean`
Checks if a MIME type is blob (binary large object).

**Example:**
```typescript
mime.isBlob('application/octet-stream'); // true
mime.isBlob('text/plain'); // false
```

##### `isStream(mimeType: string): boolean`
Checks if a MIME type is stream-related.

**Example:**
```typescript
mime.isStream('application/octet-stream'); // true
mime.isStream('application/stream'); // true
mime.isStream('text/plain'); // false
```

##### `isFormData(mimeType: string): boolean`
Checks if a MIME type is form data.

**Example:**
```typescript
mime.isFormData('application/form-data'); // true
mime.isFormData('application/json'); // false
```

##### `isForm(mimeType: string): boolean`
Checks if a MIME type is URL-encoded form.

**Example:**
```typescript
mime.isForm('application/x-www-form-urlencoded'); // true
mime.isForm('application/json'); // false
```

##### `isMultipart(mimeType: string): boolean`
Checks if a MIME type is multipart-related.

**Example:**
```typescript
mime.isMultipart('multipart/form-data'); // true
mime.isMultipart('multipart/mixed'); // true
mime.isMultipart('application/json'); // false
```

##### `isPlainText(mimeType: string): boolean`
Checks if a MIME type is plain text.

**Example:**
```typescript
mime.isPlainText('text/plain'); // true
mime.isPlainText('text/html'); // false
```

##### `isMarkdown(mimeType: string): boolean`
Checks if a MIME type is Markdown.

**Example:**
```typescript
mime.isMarkdown('text/markdown'); // true
mime.isMarkdown('text/x-markdown'); // true
mime.isMarkdown('text/plain'); // false
```

##### `isRtf(mimeType: string): boolean`
Checks if a MIME type is RTF (Rich Text Format).

**Example:**
```typescript
mime.isRtf('application/rtf'); // true
mime.isRtf('text/plain'); // false
```

##### `isGzip(mimeType: string): boolean`
Checks if a MIME type is gzip-compressed.

**Example:**
```typescript
mime.isGzip('application/gzip'); // true
mime.isGzip('application/x-gzip'); // true
mime.isGzip('application/zip'); // false
```

#### `MimeType`
TypeScript type representing all valid MIME types.

**Example:**
```typescript
import { MimeType } from '@talosjs/http-mimes';

const contentType: MimeType = 'application/json'; // Type-safe
```

### Interface

#### `IMime`
Interface defining all available MIME type detection methods.

**Example:**
```typescript
import { IMime } from '@talosjs/http-mimes';

class CustomMime implements IMime {
  // Implement all required methods
  isJson(mimeType: string): boolean {
    // Custom implementation
    return mimeType === 'application/json';
  }
  // ... other methods
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
