import { splitToWords } from "./splitToWords";

export const toKebabCase = (input: string): string => {
  input = input.trim();
  return splitToWords(input).join("-").toLowerCase();
};
