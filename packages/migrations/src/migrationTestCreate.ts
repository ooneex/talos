import { join } from "node:path";
import testTemplate from "./migration.test.txt";

export const migrationTestCreate = async (config: {
  name: string;
  testsDir: string;
  module?: string;
}): Promise<string> => {
  const { name, testsDir, module } = config;
  const testPath = join(process.cwd(), testsDir, `${name}.spec.ts`);

  const testFile = Bun.file(testPath);
  if (await testFile.exists()) return testPath;

  const content = testTemplate.replace(/\{\{NAME\}\}/g, name).replace(/\{\{MODULE\}\}/g, module ?? "");
  await Bun.write(testPath, content);

  return testPath;
};
