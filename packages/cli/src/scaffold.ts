import { join } from "node:path";
import { TerminalLogger } from "@talosjs/logger";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { askConfirm } from "./prompts/askConfirm";
import { askName } from "./prompts/askName";
import { ensureModule, LOG_OPTIONS } from "./utils";

export type ScaffoldConfigType = {
  /** Human-readable resource label used in messages (e.g. "Cache") */
  label: string;
  /** Prompt shown when no name option is provided */
  promptMessage: string;
  /** Class and file name suffix appended to the normalized name (e.g. "Cache") */
  suffix: string;
  /** Suffixes stripped from the user-provided name; defaults to [suffix] */
  stripSuffixes?: string[];
  /** Source file template ({{NAME}} is replaced with the normalized name) */
  template: string;
  /** Test file template ({{NAME}} and {{MODULE}} are replaced) */
  testTemplate: string;
  /** Subdirectory under the module's src/ (e.g. "cache") */
  dir: string;
  /** Subdirectory under the module's tests/; defaults to dir */
  testsDir?: string;
  /** Module class array to register the generated class into (e.g. "cronJobs") */
  moduleField?: string;
  /** Runtime package installed with `bun add` when missing (e.g. "@talosjs/cache") */
  dependency?: string;
  /** Extra {{KEY}} replacements applied to the source template */
  templateData?: (name: string) => Record<string, string>;
  /** Static sibling files written into the resource dir once, keyed by file name (skipped if they already exist) */
  staticFiles?: Record<string, string>;
};

export type ScaffoldOptionsType = {
  name?: string;
  module?: string;
  override?: boolean;
};

export const addClassToModule = async (
  modulePath: string,
  className: string,
  importDir: string,
  field: string,
): Promise<void> => {
  let content = await Bun.file(modulePath).text();
  const importLine = `import { ${className} } from "./${importDir}/${className}";\n`;

  const lastImportIndex = content.lastIndexOf("import ");
  const lineEnd = content.indexOf("\n", lastImportIndex);
  content = `${content.slice(0, lineEnd + 1)}${importLine}${content.slice(lineEnd + 1)}`;

  const regex = new RegExp(`(${field}:\\s*\\[)([^\\]]*)`, "s");
  const match = content.match(regex);
  if (match) {
    const existing = match[2]?.trim();
    const newValue = existing ? `${existing}, ${className}` : className;
    content = content.replace(regex, `$1${newValue}`);
  }

  await Bun.write(modulePath, content);
};

export const installDependency = async (dependency: string): Promise<void> => {
  const packageJsonPath = join(process.cwd(), "package.json");
  const packageJson = await Bun.file(packageJsonPath).json();
  const deps = packageJson.dependencies ?? {};
  const devDeps = packageJson.devDependencies ?? {};

  if (!deps[dependency] && !devDeps[dependency]) {
    const install = Bun.spawn(["bun", "add", dependency], {
      cwd: process.cwd(),
      stdout: "ignore",
      stderr: "inherit",
    });
    await install.exited;
  }
};

export const scaffoldResource = async (config: ScaffoldConfigType, options: ScaffoldOptionsType): Promise<void> => {
  let { name, module = "shared", override = false } = options;

  if (!name) {
    name = await askName({ message: config.promptMessage });
  }

  name = toPascalCase(name);
  for (const suffix of config.stripSuffixes ?? [config.suffix]) {
    name = name.replace(new RegExp(`${suffix}$`), "");
  }

  const content = renderTemplate(config, name);

  await ensureModule(module);

  const base = join("modules", module);
  const localDir = join(base, "src", config.dir);
  const fileName = `${name}${config.suffix}.ts`;
  const filePath = join(process.cwd(), localDir, fileName);

  if (!override && (await Bun.file(filePath).exists())) {
    const shouldOverride = await askConfirm({
      message: `${config.label} "${name}${config.suffix}" already exists. Override it?`,
      initial: false,
    });

    if (!shouldOverride) {
      return;
    }
  }

  await Bun.write(filePath, content);

  // Generate test file
  const testContent = config.testTemplate.replace(/{{NAME}}/g, name).replace(/{{MODULE}}/g, module);
  const testsLocalDir = join(base, "tests", config.testsDir ?? config.dir);
  const testFilePath = join(process.cwd(), testsLocalDir, `${name}${config.suffix}.spec.ts`);
  await Bun.write(testFilePath, testContent);

  // Register the generated class in its module
  if (config.moduleField) {
    const modulePascalName = toPascalCase(module);
    const modulePath = join(process.cwd(), base, "src", `${modulePascalName}Module.ts`);
    if (await Bun.file(modulePath).exists()) {
      await addClassToModule(modulePath, `${name}${config.suffix}`, config.dir, config.moduleField);
    }
  }

  const logger = new TerminalLogger();

  logger.success(`${join(localDir, name)}${config.suffix}.ts created successfully`, undefined, LOG_OPTIONS);

  logger.success(`${join(testsLocalDir, name)}${config.suffix}.spec.ts created successfully`, undefined, LOG_OPTIONS);

  // Write static sibling files (e.g. a shared dictionary) once, without overriding existing ones
  for (const [staticName, staticContent] of Object.entries(config.staticFiles ?? {})) {
    const staticPath = join(process.cwd(), localDir, staticName);
    if (!(await Bun.file(staticPath).exists())) {
      await Bun.write(staticPath, staticContent);
      logger.success(`${join(localDir, staticName)} created successfully`, undefined, LOG_OPTIONS);
    }
  }

  // Install the runtime dependency if not already installed
  if (config.dependency) {
    await installDependency(config.dependency);
  }
};

const renderTemplate = (config: ScaffoldConfigType, name: string): string => {
  let content = config.template.replace(/{{NAME}}/g, name);

  for (const [key, value] of Object.entries(config.templateData?.(name) ?? {})) {
    content = content.replace(new RegExp(`{{${key}}}`, "g"), value);
  }

  return content;
};
