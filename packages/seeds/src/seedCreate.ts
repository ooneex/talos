import { join } from "node:path";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { Glob } from "bun";
import testTemplate from "./seed.test.txt";
import template from "./seed.txt";

export const seedCreate = async (config: {
  name: string;
  seedsDir?: string;
  testsDir?: string;
  module?: string;
}): Promise<{ seedPath: string; testPath: string; dataPath: string }> => {
  const name = toPascalCase(config.name).replace(/Seed$/, "");
  const seedName = `${name}Seed`;
  const dataFile = toKebabCase(seedName);
  const seedsDir = config.seedsDir || "seeds";
  const testsDir = config.testsDir || join("tests", "seeds");

  const seedContent = template.replaceAll("{{ name }}", seedName).replaceAll("{{ dataFile }}", dataFile);
  await Bun.write(join(process.cwd(), seedsDir, `${seedName}.ts`), seedContent);

  await Bun.write(join(process.cwd(), seedsDir, `${dataFile}.yml`), "# Seed data\n");

  const testContent = testTemplate
    .replace(/\{\{NAME\}\}/g, name)
    .replace(/\{\{DATA_FILE\}\}/g, dataFile)
    .replace(/\{\{MODULE\}\}/g, config.module ?? "");
  await Bun.write(join(process.cwd(), testsDir, `${seedName}.spec.ts`), testContent);

  const imports: string[] = [];
  const glob = new Glob("**/*Seed.ts");
  for await (const file of glob.scan(join(process.cwd(), seedsDir))) {
    const seedClassName = file.replace(/\.ts$/, "");
    imports.push(`export { ${seedClassName} } from './${seedClassName}';`);
  }

  await Bun.write(join(process.cwd(), seedsDir, "seeds.ts"), `${imports.sort().join("\n")}\n`);

  return {
    seedPath: join(seedsDir, `${seedName}.ts`),
    testPath: join(testsDir, `${seedName}.spec.ts`),
    dataPath: join(seedsDir, `${dataFile}.yml`),
  };
};
