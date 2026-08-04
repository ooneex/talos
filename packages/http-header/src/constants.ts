import { HEADERS_PART_1 } from "./constants/part1";
import { HEADERS_PART_2 } from "./constants/part2";
import { HEADERS_PART_3 } from "./constants/part3";

export const HEADERS: readonly [...typeof HEADERS_PART_1, ...typeof HEADERS_PART_2, ...typeof HEADERS_PART_3] = [
  ...HEADERS_PART_1,
  ...HEADERS_PART_2,
  ...HEADERS_PART_3,
];
