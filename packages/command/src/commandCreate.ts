import { join } from "node:path";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { Glob } from "bun";
import testTemplate from "./command.test.txt";
import template from "./command.txt";

export const commandCreate = async (config: {
  name: string;
  module: string;
  commandDir?: string;
  testsDir?: string;
}): Promise<{ commandPath: string; testPath: string }> => {
  const name = toPascalCase(config.name).replace(/Command$/, "");
  const module = toKebabCase(config.module);
  const commandName = toKebabCase(name).replace(/-/g, ":");
  const commandDir = config.commandDir || join("src", "commands");
  const testsDir = config.testsDir || join("tests", "commands");

  const content = template
    .replace(/\{\{NAME\}\}/g, name)
    .replace(/\{\{COMMAND_NAME\}\}/g, commandName)
    .replace(/\{\{COMMAND_DESCRIPTION\}\}/g, `Execute ${commandName} command`);

  await Bun.write(join(process.cwd(), commandDir, `${name}Command.ts`), content);

  const testContent = testTemplate.replace(/\{\{NAME\}\}/g, name).replace(/\{\{MODULE\}\}/g, module);
  await Bun.write(join(process.cwd(), testsDir, `${name}Command.spec.ts`), testContent);

  const imports: string[] = [];
  const glob = new Glob("**/*Command.ts");
  for await (const file of glob.scan(join(process.cwd(), commandDir))) {
    const commandClassName = file.replace(/\.ts$/, "");
    imports.push(`export { ${commandClassName} } from './${commandClassName}';`);
  }
  await Bun.write(join(process.cwd(), commandDir, "commands.ts"), `${imports.sort().join("\n")}\n`);

  return {
    commandPath: join(commandDir, `${name}Command.ts`),
    testPath: join(testsDir, `${name}Command.spec.ts`),
  };
};
