import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { askConfirm } from "../prompts/askConfirm";
import { askName } from "../prompts/askName";
import mailerTestTemplate from "../templates/mailer/mailer.test.txt";
import mailerTemplate from "../templates/mailer/mailer.txt";
import mailerTemplateTestTemplate from "../templates/mailer/mailer-template.test.txt";
import mailerTemplateTemplate from "../templates/mailer/mailer-template.txt";
import { createSpinner, ensureModule, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  name?: string;
  module?: string;
  override?: boolean;
};

@decorator.command()
export class MailerCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "mailer:create";
  }

  public getDescription(): string {
    return "Generate a new mailer class";
  }

  public async run(options: T): Promise<void> {
    let { name, module = "shared", override = false } = options;

    if (!name) {
      name = await askName({ message: "Enter mailer name" });
    }

    name = toPascalCase(name).replace(/Mailer$/, "");

    const mailerContent = mailerTemplate.replace(/{{NAME}}/g, name);
    const templateContent = mailerTemplateTemplate.replace(/{{NAME}}/g, name);

    await ensureModule(module);

    const base = join("modules", module);
    const mailerLocalDir = join(base, "src", "mailers");
    const mailerDir = join(process.cwd(), mailerLocalDir);
    const mailerFilePath = join(mailerDir, `${name}Mailer.ts`);
    const templateFilePath = join(mailerDir, `${name}MailerTemplate.tsx`);

    if (!override && (await Bun.file(mailerFilePath).exists())) {
      const shouldOverride = await askConfirm({
        message: `Mailer "${name}Mailer" already exists. Override it?`,
        initial: false,
      });

      if (!shouldOverride) {
        return;
      }
    }

    // Generate source and test files
    const mailerTestContent = mailerTestTemplate.replace(/{{NAME}}/g, name).replace(/{{MODULE}}/g, module);
    const templateTestContent = mailerTemplateTestTemplate.replace(/{{NAME}}/g, name).replace(/{{MODULE}}/g, module);
    const testsLocalDir = join(base, "tests", "mailers");
    const testsDir = join(process.cwd(), testsLocalDir);
    const mailerTestFilePath = join(testsDir, `${name}Mailer.spec.ts`);
    const templateTestFilePath = join(testsDir, `${name}MailerTemplate.spec.ts`);

    // Every file targets an independent path, so write them concurrently.
    await Promise.all([
      Bun.write(mailerFilePath, mailerContent),
      Bun.write(templateFilePath, templateContent),
      Bun.write(mailerTestFilePath, mailerTestContent),
      Bun.write(templateTestFilePath, templateTestContent),
    ]);

    const logger = new TerminalLogger();

    logger.success(`${join(mailerLocalDir, name)}Mailer.ts created successfully`, undefined, LOG_OPTIONS);

    logger.success(`${join(mailerLocalDir, name)}MailerTemplate.tsx created successfully`, undefined, LOG_OPTIONS);

    logger.success(`${join(testsLocalDir, name)}Mailer.spec.ts created successfully`, undefined, LOG_OPTIONS);

    logger.success(`${join(testsLocalDir, name)}MailerTemplate.spec.ts created successfully`, undefined, LOG_OPTIONS);

    // Install @talosjs/mailer dependency if not already installed
    const packageJsonPath = join(process.cwd(), "package.json");
    const packageJson = await Bun.file(packageJsonPath).json();
    const deps = packageJson.dependencies ?? {};
    const devDeps = packageJson.devDependencies ?? {};

    if (!deps["@talosjs/mailer"] && !devDeps["@talosjs/mailer"]) {
      const spinner = createSpinner("Installing @talosjs/mailer...");
      const install = Bun.spawn(["bun", "add", "@talosjs/mailer"], {
        cwd: process.cwd(),
        stdout: "ignore",
        stderr: "ignore",
      });
      await install.exited;
      spinner.stop();
    }
  }
}
