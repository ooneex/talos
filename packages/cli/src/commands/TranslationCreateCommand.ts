import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { toSnakeCase } from "@talosjs/utils/toSnakeCase";
import { askConfirm } from "../prompts/askConfirm";
import { askName } from "../prompts/askName";
import { installDependency, type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import useLangTemplate from "../templates/spa/spa.use-lang.txt";
import useTranslateTemplate from "../templates/spa/spa.use-translate.txt";
import jsonDict from "../templates/translation.json.txt";
import testTemplate from "../templates/translation.test.txt";
import template from "../templates/translation.txt";
import dict from "../templates/translation.yml.txt";
import { ensureModule, LOG_OPTIONS } from "../utils";

/** Reads the declared `type` of a module from its `<name>.yml`; an absent type defaults to `module`. */
const readModuleType = async (moduleKebab: string): Promise<string> => {
  const ymlFile = Bun.file(join(process.cwd(), "modules", moduleKebab, `${moduleKebab}.yml`));
  if (!(await ymlFile.exists())) {
    return "module";
  }
  return (await ymlFile.text()).match(/type:\s*"([^"]+)"/)?.[1] ?? "module";
};

@decorator.command()
export class TranslationCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "translation:create";
  }

  public getDescription(): string {
    return "Generate a new translation class";
  }

  public async run(options: T): Promise<void> {
    const moduleKebab = toKebabCase(toPascalCase(options.module ?? "shared").replace(/Module$/, ""));

    // A spa module consumes its dictionary on the front-end, so it gets a
    // `use<Name>Translate` hook instead of a backend Translation class.
    if ((await readModuleType(moduleKebab)) === "spa") {
      await this.scaffoldSpaTranslation(moduleKebab, options);
      return;
    }

    await scaffoldResource(
      {
        label: "Translation",
        promptMessage: "Enter translation name",
        suffix: "Translation",
        template,
        testTemplate,
        dir: "translations",
        dependency: "@talosjs/translation",
        templateData: (name) => ({ SNAKE: toSnakeCase(name) }),
        staticFiles: { "translations.yml": dict },
      },
      options,
    );
  }

  /**
   * Scaffolds the spa flavour: a `use<Name>Translate` hook that reads the active
   * language from `useLang` and looks keys up in `translations.json`. The hook and
   * its dictionary live under the feature slice (`src/features/<feature>/translations`).
   * No backend Translation class is generated. The feature's `translations.json` dict
   * and the shared `useLang` hook the translate hook depends on are written once,
   * without overriding existing copies.
   */
  private async scaffoldSpaTranslation(moduleKebab: string, options: ScaffoldOptionsType): Promise<void> {
    let name = options.name ?? (await askName({ message: "Enter translation name" }));
    name = toPascalCase(name).replace(/Translation$/, "");

    await ensureModule(moduleKebab);

    const logger = new TerminalLogger();
    // A spa translation belongs to a vertical feature slice, so its folder lives
    // under `src/features/<feature>/translations` (the feature is the kebab-case
    // of the translation name).
    const featureKebab = toKebabCase(name);
    const translationsLocalDir = join("modules", moduleKebab, "src", "features", featureKebab, "translations");

    // The translate hook for this resource.
    const hookLocalPath = join(translationsLocalDir, `use${name}Translate.ts`);
    const hookPath = join(process.cwd(), hookLocalPath);

    if (!options.override && (await Bun.file(hookPath).exists())) {
      const shouldOverride = await askConfirm({
        message: `Hook "use${name}Translate" already exists. Override it?`,
        initial: false,
      });

      if (!shouldOverride) {
        return;
      }
    }

    await Bun.write(hookPath, useTranslateTemplate.replace(/{{NAME}}/g, name));
    logger.success(`${hookLocalPath} created successfully`, undefined, LOG_OPTIONS);

    // The feature's JSON dictionary consumed by the hook, written once.
    const dictLocalPath = join(translationsLocalDir, "translations.json");
    const dictPath = join(process.cwd(), dictLocalPath);
    if (!(await Bun.file(dictPath).exists())) {
      await Bun.write(dictPath, jsonDict);
      logger.success(`${dictLocalPath} created successfully`, undefined, LOG_OPTIONS);
    }

    // The `useLang` hook the translate hook imports, written once.
    const useLangLocalPath = join("modules", moduleKebab, "src", "shared", "hooks", "useLang.ts");
    const useLangPath = join(process.cwd(), useLangLocalPath);
    if (!(await Bun.file(useLangPath).exists())) {
      await Bun.write(useLangPath, useLangTemplate);
      logger.success(`${useLangLocalPath} created successfully`, undefined, LOG_OPTIONS);
    }

    await installDependency("@talosjs/utils");
  }
}
