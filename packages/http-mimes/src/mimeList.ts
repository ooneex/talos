import { MIME_PART_1 } from "./mimeList/part1";
import { MIME_PART_2 } from "./mimeList/part2";
import { MIME_PART_3 } from "./mimeList/part3";
import { MIME_PART_4 } from "./mimeList/part4";
import { MIME_PART_5 } from "./mimeList/part5";
import { MIME_PART_6 } from "./mimeList/part6";

export const MIME: readonly [
  ...typeof MIME_PART_1,
  ...typeof MIME_PART_2,
  ...typeof MIME_PART_3,
  ...typeof MIME_PART_4,
  ...typeof MIME_PART_5,
  ...typeof MIME_PART_6,
] = [...MIME_PART_1, ...MIME_PART_2, ...MIME_PART_3, ...MIME_PART_4, ...MIME_PART_5, ...MIME_PART_6];
