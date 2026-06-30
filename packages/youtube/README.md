# @talosjs/youtube

YouTube video downloader and metadata extraction library for fetching video information, thumbnails, and media streams.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Transcript Fetching** - Retrieve timestamped transcripts and video metadata via `Youtube#transcript`

✅ **ytdlp Integration** - Type definitions for ytdlp-nodejs including video/audio quality, format options, and download progress

✅ **Quality Types** - `YoutubeVideoQualityType` (144p to 2160p) and `YoutubeAudioQualityType` for stream selection

✅ **Error Handling** - Custom `YoutubeException` for YouTube-specific error scenarios

✅ **Type-Safe** - Full TypeScript support with `IYoutube` interface and re-exported ytdlp types

> For URL helpers like `getId`, `getEmbedUrl`, and `getWatchUrl`, see [`@talosjs/youtube-utils`](../youtube-utils).

## Installation

```bash
bun add @talosjs/youtube
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
