import { splitToWords } from "./splitToWords";

export const toSnakeCase = (input: string): string => {
  input = input.trim();
  const words = splitToWords(input);
  return words.map((word) => word.toLowerCase()).join("_");
};
