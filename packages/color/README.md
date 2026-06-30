# @talosjs/color

Curated color palette with hex values and human-friendly names plus TypeScript types for UI theming.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

- **Simple Palette** - `SIMPLE_COLORS` — a curated set of 26 hex colors suitable for charts, avatars, and tags
- **Human-Friendly Names** - `SIMPLE_COLOR_NAMES` maps each hex to a readable label (Blue, Emerald, Coral, …)
- **Type-Safe** - `SimpleColorType` narrows to the exact hex values in the palette
- **Zero Dependencies** - Pure constants, no runtime dependencies

## Installation

```bash
bun add @talosjs/color
```

## Usage

```ts
import { SIMPLE_COLOR_NAMES, SIMPLE_COLORS, type SimpleColorType } from "@talosjs/color";

const color: SimpleColorType = "#3B82F6";
SIMPLE_COLOR_NAMES[color]; // "Blue"

for (const hex of SIMPLE_COLORS) {
  console.log(hex, SIMPLE_COLOR_NAMES[hex]);
}
```

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
