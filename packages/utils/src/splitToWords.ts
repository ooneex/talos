const CAPITALIZED_WORD_WITH_DIGITS_REGEXP = /\p{Lu}\p{Ll}+\p{N}+/u; // e.g. Apple123
const CAPITALIZED_WORD_REGEXP = /\p{Lu}\p{Ll}+/u; // e.g. Apple
const ACRONYM_WITH_DIGITS_REGEXP = /\p{Lu}+\p{N}+/u; // e.g. ID1, URL2
const ACRONYM_REGEXP = /\p{Lu}+(?=(\p{Lu}\p{Ll})|\P{L}|\b)/u; // e.g. ID, URL, handles an acronym followed by a capitalized word e.g. HTMLElement
const LOWERCASED_WORD_WITH_DIGITS_REGEXP = /\p{Ll}+\p{N}+/u; // e.g. v1, abc123
const LOWERCASED_WORD_REGEXP = /(\p{Ll}+)/u; // e.g. apple
const ANY_LETTERS = /\p{L}+/u; // will match any sequence of letters, including in languages without a concept of upper/lower case
const DIGITS_REGEXP = /\p{N}+/u; // e.g. 123

const WORD_OR_NUMBER_REGEXP = new RegExp(
  `${CAPITALIZED_WORD_WITH_DIGITS_REGEXP.source}|${CAPITALIZED_WORD_REGEXP.source}|${ACRONYM_WITH_DIGITS_REGEXP.source}|${ACRONYM_REGEXP.source}|${LOWERCASED_WORD_WITH_DIGITS_REGEXP.source}|${LOWERCASED_WORD_REGEXP.source}|${ANY_LETTERS.source}|${DIGITS_REGEXP.source}`,
  "gu",
);

export const splitToWords = (input: string): string[] => input.match(WORD_OR_NUMBER_REGEXP) ?? [];
