export const capitalize = (word: string): string =>
  word ? word[0]?.toUpperCase() + word.slice(1).toLowerCase() : word;
