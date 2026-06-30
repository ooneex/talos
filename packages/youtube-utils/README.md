# @talosjs/youtube-utils

YouTube URL utilities for extracting video IDs and generating embed or watch URLs.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

- **Video ID Extraction** - Parse video IDs from watch URLs, short URLs, embed URLs, shorts URLs, and other YouTube URL formats via `getId`
- **Embed URL Generation** - Convert any YouTube URL or video ID into an embeddable URL via `getEmbedUrl`
- **Watch URL Generation** - Convert any YouTube URL or video ID into a standard watch URL via `getWatchUrl`
- **Zero Dependencies** - Pure TypeScript helpers with no runtime dependencies
- **Type-Safe** - Full TypeScript support

## Installation

```bash
bun add @talosjs/youtube-utils
```

## Usage

```ts
import { getEmbedUrl, getId, getWatchUrl } from "@talosjs/youtube-utils";

getId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"); // "dQw4w9WgXcQ"
getEmbedUrl("https://youtu.be/dQw4w9WgXcQ"); // "https://www.youtube.com/embed/dQw4w9WgXcQ"
getWatchUrl("dQw4w9WgXcQ"); // "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
