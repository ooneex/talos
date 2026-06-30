import { join } from "node:path";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import testTemplate from "./seed.test.txt";

export const seedTestCreate = async (config: { name: string; testsDir: string; module?: string }): Promise<string> => {
  const { name, testsDir, module } = config;
  const testPath = join(process.cwd(), testsDir, `${name}.spec.ts`);

  const testFile = Bun.file(testPath);
  if (await testFile.exists()) return testPath;

  const baseName = name.replace(/Seed$/, "");
  const dataFile = toKebabCase(name);

  const content = testTemplate
    .replace(/\{\{NAME\}\}/g, baseName)
    .replace(/\{\{DATA_FILE\}\}/g, dataFile)
    .replace(/\{\{MODULE\}\}/g, module ?? "");
  await Bun.write(testPath, content);

  return testPath;
};
