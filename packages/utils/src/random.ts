import { customAlphabet, randomInt } from "./nanoid";

const HEX_ALPHABET = "0123456789abcdef";
const DIGIT_ALPHABET = "0123456789";
const LETTER_ALPHABET = "abcdef";

const hexId = customAlphabet(HEX_ALPHABET, 10);
const digitId = customAlphabet(DIGIT_ALPHABET, 10);
const letterId = customAlphabet(LETTER_ALPHABET, 2);

export const random = {
  id(): string {
    return hexId(20);
  },
  nanoid(size?: number): string {
    return hexId(size);
  },
  stringInt(size?: number): string {
    return digitId(size);
  },
  nanoidFactory(size?: number): (size?: number) => string {
    return customAlphabet(HEX_ALPHABET, size ?? 10);
  },
  code(): string {
    const chars = [...letterId(2), ...digitId(6)];
    let result = "";

    while (chars.length > 0) {
      result += chars.splice(randomInt(chars.length), 1).join("");
    }

    return result;
  },
};
