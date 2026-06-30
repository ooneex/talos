# @talosjs/html

HTML parsing and DOM manipulation toolkit powered by Cheerio -- extract, transform, and query HTML content with a jQuery-like API.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

- **Cheerio Powered** - Built on Cheerio for fast, reliable HTML parsing with a jQuery-like API
- **Load from String or URL** - Parse HTML from raw strings or fetch and parse directly from URLs
- **Content Extraction** - Retrieve plain text content or full HTML output from parsed documents
- **Image Extraction** - Extract all images with their src, alt, title, width, and height attributes
- **Link Extraction** - Extract all anchor links with href, text, title, target, and rel attributes
- **Heading Extraction** - Extract all headings (h1-h6) with level, text, and id information
- **Video Extraction** - Extract video elements with sources, poster, controls, and playback attributes
- **Task Extraction** - Extract checkbox task items with text and checked state
- **Type-Safe** - Full TypeScript support with proper type definitions for all extracted data
- **Method Chaining** - Fluent API with chainable load methods

## Installation

```bash
bun add @talosjs/html
```

## Usage

### Basic Usage

```typescript
import { Html } from '@talosjs/html';

// Parse HTML from a string
const html = new Html('<h1>Hello World</h1><p>Some content</p>');

console.log(html.getContent()); // "Hello WorldSome content"
console.log(html.getHtml());    // Full HTML output
```

### Loading HTML

```typescript
import { Html } from '@talosjs/html';

const html = new Html();

// Load from string
html.load('<div><a href="/link">Click here</a></div>');

// Load from URL
await html.loadUrl('https://example.com');
```

### Extracting Images

```typescript
import { Html } from '@talosjs/html';

const html = new Html(`
  <img src="photo.jpg" alt="A photo" width="800" height="600" />
  <img src="logo.png" alt="Logo" />
`);

const images = html.getImages();
// [
//   { src: 'photo.jpg', alt: 'A photo', title: null, width: '800', height: '600' },
//   { src: 'logo.png', alt: 'Logo', title: null, width: null, height: null }
// ]
```

### Extracting Links

```typescript
import { Html } from '@talosjs/html';

const html = new Html(`
  <a href="/about" title="About us">About</a>
  <a href="https://example.com" target="_blank" rel="noopener">External</a>
`);

const links = html.getLinks();
// [
//   { href: '/about', text: 'About', title: 'About us', target: null, rel: null },
//   { href: 'https://example.com', text: 'External', title: null, target: '_blank', rel: 'noopener' }
// ]
```

### Extracting Headings

```typescript
import { Html } from '@talosjs/html';

const html = new Html(`
  <h1 id="title">Main Title</h1>
  <h2>Section One</h2>
  <h3 id="sub">Subsection</h3>
`);

const headings = html.getHeadings();
// [
//   { level: 1, text: 'Main Title', id: 'title' },
//   { level: 2, text: 'Section One', id: null },
//   { level: 3, text: 'Subsection', id: 'sub' }
// ]
```

### Extracting Videos

```typescript
import { Html } from '@talosjs/html';

const html = new Html(`
  <video poster="thumb.jpg" controls>
    <source src="video.mp4" type="video/mp4" />
    <source src="video.webm" type="video/webm" />
  </video>
`);

const videos = html.getVideos();
// [
//   {
//     src: null, poster: 'thumb.jpg', width: null, height: null,
//     controls: true, autoplay: false, loop: false, muted: false,
//     sources: [
//       { src: 'video.mp4', type: 'video/mp4' },
//       { src: 'video.webm', type: 'video/webm' }
//     ]
//   }
// ]
```

### Extracting Tasks

```typescript
import { Html } from '@talosjs/html';

const html = new Html(`
  <ul>
    <li><input type="checkbox" checked /> Done task</li>
    <li><input type="checkbox" /> Pending task</li>
  </ul>
`);

const tasks = html.getTasks();
// [
//   { text: 'Done task', checked: true },
//   { text: 'Pending task', checked: false }
// ]
```

## API Reference

### `Html` Class

The main class for parsing and analyzing HTML documents.

#### Constructor

**`new Html(html?: string)`**

Creates a new Html instance, optionally parsing the provided HTML string.

**Parameters:**
- `html` - Optional HTML string to parse

#### Methods

**`load(html: string): this`**

Load and parse HTML from a string. Returns the instance for chaining.

**`loadUrl(url: string | URL): Promise<this>`**

Fetch and parse HTML from a URL. Returns a promise resolving to the instance.

**`getContent(): string`**

Get the plain text content of the parsed document.

**`getHtml(): string`**

Get the full HTML string of the parsed document.

**`getImages(): HtmlImageType[]`**

Extract all `<img>` elements with their attributes.

**`getLinks(): HtmlLinkType[]`**

Extract all `<a>` elements with their attributes.

**`getHeadings(): HtmlHeadingType[]`**

Extract all heading elements (h1-h6) with level, text, and id.

**`getVideos(): HtmlVideoType[]`**

Extract all `<video>` elements with their sources and attributes.

**`getTasks(): HtmlTaskType[]`**

Extract all checkbox task items with text and checked state.

### Type Definitions

#### `HtmlImageType`
```typescript
type HtmlImageType = {
  src: string;
  alt: string | null;
  title: string | null;
  width: string | null;
  height: string | null;
};
```

#### `HtmlLinkType`
```typescript
type HtmlLinkType = {
  href: string;
  text: string | null;
  title: string | null;
  target: string | null;
  rel: string | null;
};
```

#### `HtmlHeadingType`
```typescript
type HtmlHeadingType = {
  level: number;
  text: string;
  id: string | null;
};
```

#### `HtmlVideoType`
```typescript
type HtmlVideoType = {
  src: string | null;
  poster: string | null;
  width: string | null;
  height: string | null;
  controls: boolean;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  sources: { src: string; type: string | null }[];
};
```

#### `HtmlTaskType`
```typescript
type HtmlTaskType = {
  text: string;
  checked: boolean;
};
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

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

Made with love by the Talos team
