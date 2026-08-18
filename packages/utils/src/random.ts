import { customAlphabet } from "nanoid";

export const random = {
  id(): string {
    return customAlphabet("1234567890abcdef", 20)();
  },
  nanoid(size?: number): string {
    return customAlphabet("1234567890abcdef", size ?? 10)();
  },
  stringInt(size?: number): string {
    return customAlphabet("1234567890", size ?? 10)();
  },
  nanoidFactory(size?: number): (size?: number) => string {
    return customAlphabet("1234567890abcdef", size ?? 10);
  },
  code(): string {
    const chars = [
      ...customAlphabet("abcdef", 2)(),
      ...customAlphabet("1234567890", 6)(),
    ];

    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
    }

    return chars.join("");
  },
};
