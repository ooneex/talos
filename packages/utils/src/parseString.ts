import { trim } from "./trim";

export const parseString = <T = unknown>(text: string): T => {
  if (/^[0-9]+$/.test(text)) {
    return Number.parseInt(text, 10) as T;
  }

  if (/^[0-9]+[.][0-9]+$/.test(text)) {
    return Number.parseFloat(text) as T;
  }

  if (/^true$/i.test(text)) {
    return true as T;
  }

  if (/^false$/i.test(text)) {
    return false as T;
  }

  if (/^null$/i.test(text)) {
    return null as T;
  }

  if (/^\[/.test(text) && /]$/.test(text)) {
    const trimmedText = trim(text, "\\[|\\]");

    let values: unknown[] = trimmedText.split(/, */);

    values = values.map((value) => parseString(value as string));

    return values as T;
  }

  try {
    const result = JSON.parse(text);

    if (result === Number.POSITIVE_INFINITY || result === Number.NEGATIVE_INFINITY) {
      return text as T;
    }

    return result;
  } catch {
    return text as T;
  }
};
