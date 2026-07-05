# @talosjs/pdf

PDF document toolkit for generating, editing, merging, splitting, and converting PDF files to images with page-level content extraction.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Create PDFs** - Generate new PDF documents with metadata (title, author, keywords)

✅ **Add Pages** - Append pages with text content and configurable font size

✅ **Split PDFs** - Split documents into separate files by page ranges

✅ **Remove Pages** - Remove individual pages or page ranges from a document

✅ **Page to Image** - Convert PDF pages to PNG images with configurable scale

✅ **Text Extraction** - Extract text content from specific pages

✅ **Image Extraction** - Extract embedded images from PDF pages and save to disk

✅ **Metadata Management** - Read and update PDF metadata (title, author, dates, keywords)

✅ **Encrypted PDF Support** - Handle password-protected PDF files

## Installation

```bash
bun add @talosjs/pdf
```

## Usage

### Creating a PDF

```typescript
import { PDF } from '@talosjs/pdf';

const pdf = new PDF('/path/to/output.pdf');

await pdf.create({
  title: 'My Document',
  author: 'John Doe',
  subject: 'Example PDF',
  keywords: ['example', 'pdf'],
});
```

### Adding Pages

```typescript
import { PDF } from '@talosjs/pdf';

const pdf = new PDF('/path/to/document.pdf');

// Add an empty page
await pdf.addPage();

// Add a page with text content
await pdf.addPage({
  content: 'Hello, World!\nThis is a new page.',
  fontSize: 16,
});
```

### Splitting a PDF

```typescript
import { PDF } from '@talosjs/pdf';

const pdf = new PDF('/path/to/document.pdf');

// Split into individual pages
for await (const result of pdf.split({ outputDir: '/output' })) {
  console.log(`Pages ${result.pages.start}-${result.pages.end}: ${result.path}`);
}

// Split by custom ranges
for await (const result of pdf.split({
  outputDir: '/output',
  ranges: [[1, 3], [5], [7, 10]],
})) {
  console.log(result.path);
}
```

### Removing Pages

```typescript
import { PDF } from '@talosjs/pdf';

const pdf = new PDF('/path/to/document.pdf');

// Remove individual pages
const result = await pdf.removePages([2, 5]);

// Remove a range of pages
const result2 = await pdf.removePages([[3, 6]]);

// Mix individual pages and ranges
const result3 = await pdf.removePages([1, [4, 6], 10]);
console.log(result3.remainingPages);
```

### Converting Pages to Images

```typescript
import { PDF } from '@talosjs/pdf';

const pdf = new PDF('/path/to/document.pdf');

// Convert all pages
for await (const result of pdf.pagesToImages({ outputDir: '/images' })) {
  console.log(`Page ${result.page}: ${result.path}`);
}

// Convert a single page
const image = await pdf.pageToImage(1, {
  outputDir: '/images',
  prefix: 'doc',
});
```

### Extracting Text Content

```typescript
import { PDF } from '@talosjs/pdf';

const pdf = new PDF('/path/to/document.pdf');

const text = await pdf.getPageContent(1);
console.log(text);
```

### Extracting Images

```typescript
import { PDF } from '@talosjs/pdf';

const pdf = new PDF('/path/to/document.pdf');

// Extract images from all pages
const images = await pdf.getImages({ outputDir: '/extracted' });
for (const img of images) {
  console.log(`Page ${img.page}: ${img.path} (${img.width}x${img.height})`);
}

// Extract images from a specific page
const page1Images = await pdf.getImages({
  outputDir: '/extracted',
  pageNumber: 1,
});
```

### Reading and Updating Metadata

```typescript
import { PDF } from '@talosjs/pdf';

const pdf = new PDF('/path/to/document.pdf');

// Read metadata
const metadata = await pdf.getMetadata();
console.log(metadata.title, metadata.author, metadata.pageCount);

// Update metadata
await pdf.updateMetadata({
  title: 'Updated Title',
  author: 'New Author',
  keywords: ['updated', 'keywords'],
});
```

### Working with Encrypted PDFs

```typescript
import { PDF } from '@talosjs/pdf';

const pdf = new PDF('/path/to/encrypted.pdf', {
  password: 'secret',
});

const metadata = await pdf.getMetadata();
```

## API Reference

### Classes

#### `PDF`

Main class for all PDF operations.

**Constructor:**
```typescript
new PDF(source: string, options?: PDFOptionsType)
```

**Parameters:**
- `source` - Path to the PDF file
- `options.password` - Password for encrypted PDFs
- `options.scale` - Scale factor for image conversion (default: 3)

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `create(options?)` | `Promise<PDFCreateResultType>` | Create a new PDF document |
| `addPage(options?)` | `Promise<PDFAddPageResultType>` | Add a page to an existing PDF |
| `getMetadata()` | `Promise<PDFMetadataResultType>` | Get document metadata |
| `updateMetadata(options)` | `Promise<void>` | Update document metadata |
| `getPageCount()` | `Promise<number>` | Get total page count |
| `pagesToImages(options)` | `AsyncGenerator<PDFPageImageResultType>` | Convert all pages to images |
| `pageToImage(pageNumber, options)` | `Promise<PDFPageImageResultType>` | Convert a specific page to an image |
| `split(options)` | `AsyncGenerator<PDFSplitResultType>` | Split PDF into separate files |
| `removePages(pages)` | `Promise<PDFRemovePagesResultType>` | Remove pages from the PDF |
| `getPageContent(pageNumber)` | `Promise<string>` | Extract text content from a page |
| `getImages(options)` | `Promise<PDFGetImagesResultType>` | Extract embedded images |

### Key Types

#### `PDFCreateOptionsType`

Options for creating a PDF: `title`, `author`, `subject`, `keywords`, `producer`, `creator`.

#### `PDFSplitOptionsType`

Split options: `outputDir`, `ranges` (array of page numbers or `[start, end]` tuples), `prefix`.

#### `PDFToImagesOptionsType`

Image conversion options: `outputDir`, `prefix`.

#### `PDFGetImagesOptionsType`

Image extraction options: `outputDir`, `prefix`, `pageNumber`.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

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
