import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { PutDirOptionsType } from "./types";

type PutDirHandlersType = {
  putDir: (bucket: string, options: PutDirOptionsType) => Promise<number>;
  putFile: (key: string, localPath: string) => Promise<number>;
};

export const putDirRecursive = async (
  handlers: PutDirHandlersType,
  bucket: string,
  options: PutDirOptionsType,
): Promise<number> => {
  const { path, filter } = options;
  const entries = await readdir(path, { withFileTypes: true });
  const tasks: Promise<number>[] = [];

  for (const entry of entries) {
    const entryLocalPath = join(path, entry.name);
    const entryKey = bucket ? `${bucket}/${entry.name}` : entry.name;

    if (filter && !filter.test(entryLocalPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      tasks.push(handlers.putDir(entryKey, filter ? { path: entryLocalPath, filter } : { path: entryLocalPath }));
      continue;
    }

    tasks.push(handlers.putFile(entryKey, entryLocalPath));
  }

  const results = await Promise.all(tasks);
  return results.reduce((sum, bytes) => sum + bytes, 0);
};
