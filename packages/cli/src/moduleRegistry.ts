/**
 * Parse JSON-with-comments (JSONC). TypeScript's `tsconfig.json` officially
 * permits `//`/`/* *\/` comments and trailing commas, which Bun's strict
 * `.json()` rejects with `Failed to parse JSON`. Comments and trailing commas
 * are stripped — respecting string literals so delimiters inside strings are
 * left untouched — before handing the result to `JSON.parse`.
 */
export const parseJsonc = <T = unknown>(text: string): T => {
  let stripped = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        stripped += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      stripped += char;
      if (char === "\\") {
        // Preserve the escaped character verbatim so `\"` doesn't close the string.
        stripped += next ?? "";
        i++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      stripped += char;
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    stripped += char;
  }

  // Drop trailing commas (`,` before a closing `}`/`]`), skipping those inside strings.
  let cleaned = "";
  inString = false;
  for (let i = 0; i < stripped.length; i++) {
    const char = stripped[i];

    if (inString) {
      cleaned += char;
      if (char === "\\") {
        cleaned += stripped[i + 1] ?? "";
        i++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      cleaned += char;
      continue;
    }

    if (char === ",") {
      let j = i + 1;
      while (j < stripped.length && /\s/.test(stripped[j] as string)) j++;
      if (stripped[j] === "}" || stripped[j] === "]") continue;
    }

    cleaned += char;
  }

  return JSON.parse(cleaned) as T;
};

const APP_MODULE_FIELDS = ["controllers", "middlewares", "cronJobs", "events"] as const;
// A microservice is standalone (no SharedModule), so it also owns its entities
const MICROSERVICE_MODULE_FIELDS = ["controllers", "entities", "middlewares", "cronJobs", "events"] as const;

const spreadIntoField = (content: string, field: string, moduleName: string): string => {
  const regex = new RegExp(`(${field}:\\s*\\[)([^\\]]*)`, "s");
  const match = content.match(regex);
  if (!match) return content;

  const existing = match[2] ?? "";
  const spread = `...${moduleName}.${field}`;
  const indent = existing.match(/\n(\s+)\S/)?.[1] ?? "    ";
  const closingIndent = existing.match(/\n(\s*)$/)?.[1] ?? "  ";
  const trimmedExisting = existing.trimEnd().replace(/,\s*$/, "");
  const newValue = trimmedExisting
    ? `${trimmedExisting},\n${indent}${spread},\n${closingIndent}`
    : `\n${indent}${spread},\n${closingIndent}`;

  return content.replace(regex, `$1${newValue}`);
};

const removeSpreadFromFields = (content: string, moduleName: string, fields: readonly string[]): string => {
  for (const field of fields) {
    const spread = `...${moduleName}.${field}`.replace(/\./g, "\\.");
    content = content.replace(new RegExp(`,\\s*${spread}`, "g"), "");
    content = content.replace(new RegExp(`${spread}\\s*,\\s*`, "g"), "");
    content = content.replace(new RegExp(spread, "g"), "");
  }
  return content;
};

const insertImport = (content: string, moduleName: string, importPath: string): string => {
  const importLine = `import { ${moduleName} } from "${importPath}";\n`;
  const lastImportIndex = content.lastIndexOf("import ");
  const lineEnd = content.indexOf("\n", lastImportIndex);
  return `${content.slice(0, lineEnd + 1)}${importLine}${content.slice(lineEnd + 1)}`;
};

const removeImport = (content: string, moduleName: string, importPath: string): string => {
  const importRegex = new RegExp(
    `import\\s*\\{\\s*${moduleName}\\s*\\}\\s*from\\s*"${importPath.replace(/\//g, "\\/")}";\\s*\\n`,
    "g",
  );
  return content.replace(importRegex, "");
};

export const addToAppModule = async (appModulePath: string, pascalName: string, kebabName: string): Promise<void> => {
  let content = await Bun.file(appModulePath).text();
  const moduleName = `${pascalName}Module`;

  content = insertImport(content, moduleName, `@module/${kebabName}/${moduleName}`);

  // Spread new module arrays into each AppModule field (entities go to SharedModule)
  for (const field of APP_MODULE_FIELDS) {
    content = spreadIntoField(content, field, moduleName);
  }

  await Bun.write(appModulePath, content);
};

export const addToMicroserviceModule = async (
  microserviceModulePath: string,
  pascalName: string,
  kebabName: string,
): Promise<void> => {
  let content = await Bun.file(microserviceModulePath).text();
  const moduleName = `${pascalName}Module`;

  content = insertImport(content, moduleName, `@module/${kebabName}/${moduleName}`);

  // Spread new module arrays into each microservice field (including entities)
  for (const field of MICROSERVICE_MODULE_FIELDS) {
    content = spreadIntoField(content, field, moduleName);
  }

  await Bun.write(microserviceModulePath, content);
};

export const addToSharedModule = async (
  sharedModulePath: string,
  pascalName: string,
  kebabName: string,
): Promise<void> => {
  let content = await Bun.file(sharedModulePath).text();
  const moduleName = `${pascalName}Module`;

  content = insertImport(content, moduleName, `@module/${kebabName}/${moduleName}`);

  // Spread new module entities into SharedModule
  content = spreadIntoField(content, "entities", moduleName);

  await Bun.write(sharedModulePath, content);
};

export const addPathAlias = async (tsconfigPath: string, kebabName: string): Promise<void> => {
  const tsconfig = parseJsonc<{ compilerOptions?: { paths?: Record<string, string[]> } }>(
    await Bun.file(tsconfigPath).text(),
  );

  tsconfig.compilerOptions ??= {};
  tsconfig.compilerOptions.paths ??= {};
  tsconfig.compilerOptions.paths[`@module/${kebabName}/*`] = [`./modules/${kebabName}/src/*`];

  await Bun.write(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
};

export const removeFromAppModule = async (
  appModulePath: string,
  pascalName: string,
  kebabName: string,
): Promise<void> => {
  if (!(await Bun.file(appModulePath).exists())) return;

  let content = await Bun.file(appModulePath).text();
  const moduleName = `${pascalName}Module`;

  content = removeImport(content, moduleName, `@module/${kebabName}/${moduleName}`);
  content = removeSpreadFromFields(content, moduleName, APP_MODULE_FIELDS);

  await Bun.write(appModulePath, content);
};

export const removeFromSharedModule = async (
  sharedModulePath: string,
  pascalName: string,
  kebabName: string,
): Promise<void> => {
  if (!(await Bun.file(sharedModulePath).exists())) return;

  let content = await Bun.file(sharedModulePath).text();
  const moduleName = `${pascalName}Module`;

  content = removeImport(content, moduleName, `@module/${kebabName}/${moduleName}`);
  content = removeSpreadFromFields(content, moduleName, ["entities"]);

  await Bun.write(sharedModulePath, content);
};

export const removePathAlias = async (tsconfigPath: string, kebabName: string): Promise<void> => {
  if (!(await Bun.file(tsconfigPath).exists())) return;

  const tsconfig = parseJsonc<{ compilerOptions?: { paths?: Record<string, string[]> } }>(
    await Bun.file(tsconfigPath).text(),
  );

  if (tsconfig.compilerOptions?.paths) {
    delete tsconfig.compilerOptions.paths[`@module/${kebabName}/*`];
  }

  await Bun.write(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
};
