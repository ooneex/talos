import { capitalize } from "./capitalize";
import { splitToWords } from "./splitToWords";

export const toCamelCase = (input: string): string => {
  input = input.trim();
  const [first = "", ...rest] = splitToWords(input);
  return [first.toLowerCase(), ...rest.map(capitalize)].join("");
};
