import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toCamelCase } from "@talosjs/utils/toCamelCase";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { removeFromAppModule, removeFromSharedModule } from "../moduleRegistry";
import { createSpinner, LOG_OPTIONS } from "../utils";
import { ModuleCreateCommand } from "./ModuleCreateCommand";

type CommandOptionsType = {
  name?: string;
  /** Target module the SDK is generated from (an `app` or a `microservice` module). */
  module?: string;
  cwd?: string;
  silent?: boolean;
};

type ControllerDefinitionType = {
  /** Method name exposed on the SDK (e.g. `grant`). */
  method: string;
  /** Controller name / key (e.g. `entitlement.grant`). */
  key: string;
  version: number;
  description: string;
  roles: string[];
  /** Route path declared on the controller (e.g. `/entitlement/grants`). */
  path: string;
  isSocket: boolean;
  /** Local route type name (e.g. `GrantEntitlementRouteType`). */
  typeName: string;
  /** Full `type <name> = { ... };` declaration copied from the controller. */
  typeDeclaration: string;
};

const BUNUP_CONFIG = `import { defineConfig } from "bunup";

export default defineConfig({
  target: "browser",
  format: ["esm"],
  drop: ["console", "debugger"],
  packages: "external",
  sourcemap: "external",
  unused: {
    level: "error",
  },
  exports: true,
  minify: false,
  dts: {
    minify: false,
  },
});
`;

@decorator.command()
export class SdkCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "sdk:create";
  }

  public getDescription(): string {
    return "Generate a browser SDK from module controllers";
  }

  /** Returns the inner body of the balanced `{ ... }` block that starts at `openIndex`. */
  private matchBalanced(text: string, openIndex: number): { body: string; end: number } | null {
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
      const char = text[i];
      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          return { body: text.slice(openIndex + 1, i), end: i };
        }
      }
    }
    return null;
  }

  /** Reads the declared `type` of a module from its `<name>.yml`; an absent type defaults to `module`. */
  private async readModuleType(modulesDir: string, moduleKebab: string): Promise<string> {
    const ymlFile = Bun.file(join(modulesDir, moduleKebab, `${moduleKebab}.yml`));
    if (!(await ymlFile.exists())) {
      return "module";
    }
    return (await ymlFile.text()).match(/type:\s*"([^"]+)"/)?.[1] ?? "module";
  }

  /** Recursively collects every `*Controller.ts` file path under `dir`. */
  private async collectControllerFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return files;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.collectControllerFiles(fullPath)));
      } else if (entry.isFile() && entry.name.endsWith("Controller.ts")) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /** Parses a controller source file into an SDK definition, or `null` when it is not a route controller. */
  private parseController(content: string, moduleName: string): ControllerDefinitionType | null {
    const typeMatch = content.match(/export\s+type\s+(\w+RouteType)\s*=\s*\{/);
    const decoratorMatch = content.match(/@Route\.(\w+)\(\s*"([^"]+)"\s*,\s*\{/);

    if (!typeMatch || !decoratorMatch || typeMatch.index === undefined || decoratorMatch.index === undefined) {
      return null;
    }

    const typeName = typeMatch[1] as string;
    const typeBody = this.matchBalanced(content, typeMatch.index + typeMatch[0].length - 1);
    if (!typeBody) {
      return null;
    }
    const typeDeclaration = `type ${typeName} = {${typeBody.body}};`;

    const method = (decoratorMatch[1] as string).toLowerCase();
    const path = decoratorMatch[2] as string;
    const isSocket = method === "socket";

    const config = this.matchBalanced(content, decoratorMatch.index + decoratorMatch[0].length - 1);
    if (!config) {
      return null;
    }
    const configBody = config.body;

    const key = configBody.match(/name\s*:\s*"([^"]+)"/)?.[1] ?? "";
    if (!key) {
      return null;
    }
    const version = Number(configBody.match(/version\s*:\s*(\d+)/)?.[1] ?? "1");
    const description = configBody.match(/description\s*:\s*"([^"]*)"/)?.[1] ?? "";
    const rolesRaw = configBody.match(/roles\s*:\s*\[([^\]]*)\]/)?.[1] ?? "";
    const roles = rolesRaw
      .split(",")
      .map((role) => role.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);

    // Derive the SDK method name from the key by stripping the module prefix.
    const methodKey = key.startsWith(`${moduleName}.`) ? key.slice(moduleName.length + 1) : key;
    const method_ = toCamelCase(methodKey.replace(/\./g, "-")) || toCamelCase(key.replace(/\./g, "-"));

    return {
      method: method_,
      key,
      version,
      description,
      roles,
      path,
      isSocket,
      typeName,
      typeDeclaration,
    };
  }

  /** Builds the `api` method entry for a single controller definition. */
  private buildApiEntry(def: ControllerDefinitionType): string {
    const t = def.typeName;
    // Auth-guarded routes (non-empty roles) require a bearer token in the input.
    const bearerToken = def.roles.length > 0 ? "\n        bearerToken: string;" : "";
    return `    ${def.method}: (
      input: {
        baseURL: string;
        params: ${t}["params"];
        payload: ${t}["payload"];
        queries: ${t}["queries"];${bearerToken}
        onSuccess?: (response: ResponseDataType<${t}["response"]>) => void;
        onMessage?: (response: ResponseDataType<${t}["response"]>) => void;
        onOpen?: (event?: Event) => void;
        onClose?: (event?: CloseEvent) => void;
        onError?: (event?: Event, response?: ResponseDataType<${t}["response"]>) => void;
      },
    ): Promise<${t}["response"]> => {
      // TODO: use ${def.isSocket ? "socket" : "fetch"} api according to controller definition
      throw new Error("Not implemented");
    },`;
  }

  /** Builds the `definition` metadata entry for a single controller definition. */
  private buildDefinitionEntry(def: ControllerDefinitionType): string {
    const roles = `[${def.roles.map((role) => `"${role}"`).join(", ")}]`;
    return `    ${def.method}: {
      key: "${def.key}",
      version: ${def.version},
      description: "${def.description.replace(/"/g, '\\"')}",
      roles: ${roles},
      endpoint: "/<prefix>/v${def.version}${def.path}",
    },`;
  }

  /** Builds the SDK source file for a single module. */
  private buildModuleFile(constName: string, definitions: ControllerDefinitionType[]): string {
    const types = definitions.map((def) => def.typeDeclaration).join("\n\n");
    const apiEntries = definitions.map((def) => this.buildApiEntry(def)).join("\n");
    const definitionEntries = definitions.map((def) => this.buildDefinitionEntry(def)).join("\n");

    return `import type { ResponseDataType } from "@talosjs/http-response";

${types}

export const ${constName} = {
  api: {
${apiEntries}
  },
  definition: {
${definitionEntries}
  },
};
`;
  }

  /** Collects the controller keys already present in a generated SDK module file. */
  private extractExistingKeys(content: string): Set<string> {
    const keys = new Set<string>();
    for (const match of content.matchAll(/key:\s*"([^"]+)"/g)) {
      if (match[1]) {
        keys.add(match[1]);
      }
    }
    return keys;
  }

  /** Injects new controller definitions into an existing SDK module file, leaving its current entries untouched. */
  private mergeModuleFile(existing: string, newDefs: ControllerDefinitionType[]): string {
    const types = newDefs.map((def) => def.typeDeclaration).join("\n\n");
    const apiEntries = newDefs.map((def) => this.buildApiEntry(def)).join("\n");
    const definitionEntries = newDefs.map((def) => this.buildDefinitionEntry(def)).join("\n");

    return (
      existing
        // New route types go right before the exported const.
        .replace(/\nexport const /, () => `\n${types}\n\nexport const `)
        // New api methods go at the end of the `api` block.
        .replace(/\n {2}},\n {2}definition: {/, () => `\n${apiEntries}\n  },\n  definition: {`)
        // New definitions go at the end of the `definition` block.
        .replace(/\n {2}},\n};\n?$/, () => `\n${definitionEntries}\n  },\n};\n`)
    );
  }

  public async run(options: T): Promise<void> {
    const { name = "sdk", module = "app", cwd = process.cwd(), silent = false } = options;
    const pascalName = toPascalCase(name).replace(/Module$/, "");
    const sdkName = toKebabCase(pascalName);
    const logger = new TerminalLogger();

    const modulesDir = join(cwd, "modules");

    // The SDK is generated from a target module. When the target is an `api`
    // module, its controllers come from every backend `module` and `api` module;
    // for a `microservice` target, controllers come from that microservice only.
    const targetModule = toKebabCase(module);
    const targetType = await this.readModuleType(modulesDir, targetModule);
    const isApiTarget = targetType === "api";

    // Create the sdk module using the standard module generator.
    const makeModule = new ModuleCreateCommand();
    await makeModule.run({ name: sdkName, cwd, silent: true });

    // An sdk module must not be registered into AppModule or SharedModule.
    await removeFromAppModule(join(modulesDir, "app", "src", "AppModule.ts"), pascalName, sdkName);
    await removeFromSharedModule(join(modulesDir, "shared", "src", "SharedModule.ts"), pascalName, sdkName);

    const sdkDir = join(modulesDir, sdkName);
    const sdkSrcDir = join(sdkDir, "src");

    // Mark the module as an sdk module in its yml config and record the target it was generated from.
    const ymlPath = join(sdkDir, `${sdkName}.yml`);
    if (await Bun.file(ymlPath).exists()) {
      const ymlContent = await Bun.file(ymlPath).text();
      await Bun.write(ymlPath, ymlContent.replace('type: "module"', `type: "sdk"\ntarget: "${targetModule}"`));
    }

    // Build the package name from the root package.json name: `@<name-in-kebab-case>/sdk`.
    const rootPackageJsonPath = join(cwd, "package.json");
    const rootPackageJson = await Bun.file(rootPackageJsonPath).json();
    const scope = toKebabCase(rootPackageJson.name ?? "app");

    const sdkPackageJsonPath = join(sdkDir, "package.json");
    const sdkPackageJson = await Bun.file(sdkPackageJsonPath).json();
    sdkPackageJson.name = `@${scope}/${sdkName}`;
    await Bun.write(sdkPackageJsonPath, `${JSON.stringify(sdkPackageJson, null, 2)}\n`);

    // Write the bunup config.
    await Bun.write(join(sdkDir, "bunup.config.ts"), BUNUP_CONFIG);

    // Scan every module (except the sdk module) and generate one SDK file per module that has controllers.
    let moduleEntries: Dirent[];
    try {
      moduleEntries = await readdir(modulesDir, { withFileTypes: true });
    } catch {
      moduleEntries = [];
    }

    const generated: { kebab: string; constName: string }[] = [];

    for (const entry of moduleEntries) {
      if (!entry.isDirectory() || entry.name === sdkName) {
        continue;
      }

      const moduleKebab = entry.name;

      if (isApiTarget) {
        // API SDK aggregates every backend `module` and `api` module.
        const type = await this.readModuleType(modulesDir, moduleKebab);
        if (type !== "module" && type !== "api") {
          continue;
        }
      } else if (moduleKebab !== targetModule) {
        // Microservice SDK only exposes the target microservice's own controllers.
        continue;
      }

      const controllersDir = join(modulesDir, moduleKebab, "src", "controllers");
      const controllerFiles = await this.collectControllerFiles(controllersDir);
      if (controllerFiles.length === 0) {
        continue;
      }

      const definitions: ControllerDefinitionType[] = [];
      for (const file of controllerFiles) {
        const content = await Bun.file(file).text();
        const definition = this.parseController(content, moduleKebab);
        if (definition) {
          definitions.push(definition);
        }
      }

      if (definitions.length === 0) {
        continue;
      }

      const constName = toCamelCase(moduleKebab);
      const sdkFile = Bun.file(join(sdkSrcDir, `${moduleKebab}.ts`));

      if (await sdkFile.exists()) {
        // The SDK file already exists (regeneration): keep controllers already
        // added — preserving any hand-written api bodies — and only inject new ones.
        const existingContent = await sdkFile.text();
        const existingKeys = this.extractExistingKeys(existingContent);
        const newDefs = definitions.filter((def) => !existingKeys.has(def.key));
        if (newDefs.length > 0) {
          await Bun.write(sdkFile, this.mergeModuleFile(existingContent, newDefs));
        }
      } else {
        await Bun.write(sdkFile, this.buildModuleFile(constName, definitions));
      }

      generated.push({ kebab: moduleKebab, constName });
    }

    // Generate the SDK index aggregating every module.
    const imports = generated.map(({ kebab, constName }) => `import { ${constName} } from "./${kebab}";`).join("\n");
    const members = generated.map(({ constName }) => `  ${constName},`).join("\n");
    const indexContent = `${imports}${imports ? "\n\n" : ""}export const sdk = {
${members}
};
`;
    await Bun.write(join(sdkSrcDir, "index.ts"), indexContent);

    // Install the runtime dependencies the generated SDK files import.
    const depsSpinner = silent ? null : createSpinner("Installing dependencies...");
    const addDeps = Bun.spawn(["bun", "add", "@talosjs/fetcher", "@talosjs/http-response", "@talosjs/socket-client"], {
      cwd: sdkDir,
      stdout: "ignore",
      stderr: "ignore",
    });
    await addDeps.exited;
    depsSpinner?.stop();

    // Install bunup as a dev dependency for the sdk module.
    const installSpinner = silent ? null : createSpinner("Installing bunup...");
    const install = Bun.spawn(["bun", "add", "-D", "bunup"], {
      cwd: sdkDir,
      stdout: "ignore",
      stderr: "ignore",
    });
    await install.exited;
    installSpinner?.stop();

    if (!silent) {
      logger.success(`modules/${sdkName} generated with ${generated.length} module(s)`, undefined, LOG_OPTIONS);
    }
  }
}
