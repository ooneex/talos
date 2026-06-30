import { capitalize } from "./capitalize";
import { splitToWords } from "./splitToWords";

export const toPascalCase = (input: string): string => {
  input = input.trim();
  return splitToWords(input).map(capitalize).join("");
};
