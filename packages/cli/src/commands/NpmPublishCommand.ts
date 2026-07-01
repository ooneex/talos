import { homedir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { createSpinner, LOG_OPTIONS } from "../utils";

type NpmAccessType = "public" | "restricted";

type CommandOptionsType = {
  package?: string;
  module?: string;
  access?: NpmAccessType;
  silent?: boolean;
};

type TargetType = {
  base: string;
  type: "package" | "module";
  name: string;
};

const NPM_REGISTRY = "registry.npmjs.org";

@decorator.command()
export class NpmPublishCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "npm:publish";
  }

  public getDescription(): string {
    return "Publish a package or module to npm";
  }

  public async run(options: T): Promise<void> {
    const { package: pkg, module, access = "public", silent } = options;
    const logger = new TerminalLogger();

    const target = this.resolveTarget(pkg, module);
    if (!target) {
      if (!silent) {
        logger.error("Specify a package with --package or a module with --module", undefined, LOG_OPTIONS);
      }
      process.exitCode = 1;
      return;
    }

    const token = await this.readToken();
    if (!token) {
      if (!silent) {
        logger.error("No npm credentials found. Run `talos npm:credentials:create` first.", undefined, LOG_OPTIONS);
      }
      process.exitCode = 1;
      return;
    }

    const targetDir = join(process.cwd(), target.base);
    const pkgJsonFile = Bun.file(join(targetDir, "package.json"));

    if (!(await pkgJsonFile.exists())) {
      if (!silent) {
        logger.error(`No ${target.type} named "${target.name}" found`, undefined, LOG_OPTIONS);
      }
      process.exitCode = 1;
      return;
    }

    const pkgJson: { name?: string; version?: string } = await pkgJsonFile.json();
    const label = pkgJson.name && pkgJson.version ? `${pkgJson.name}@${pkgJson.version}` : target.name;

    try {
      const published = await this.publish(targetDir, access, token, label, silent);

      if (published) {
        if (!silent) {
          logger.success(`Published ${label} to npm`, undefined, LOG_OPTIONS);
        }
      } else {
        process.exitCode = 1;
      }
    } catch {
      if (!silent) {
        logger.error(`Failed to publish ${label}`, undefined, LOG_OPTIONS);
      }
      process.exitCode = 1;
    }
  }

  private resolveTarget(pkg?: string, module?: string): TargetType | null {
    if (pkg) {
      return { base: join("packages", pkg), type: "package", name: pkg };
    }
    if (module) {
      return { base: join("modules", module), type: "module", name: module };
    }
    return null;
  }

  private async readToken(): Promise<string | null> {
    const credentialsPath = join(homedir(), ".talos", "credentials", "npm.yml");
    const file = Bun.file(credentialsPath);

    if (!(await file.exists())) {
      return null;
    }

    const parsed = Bun.YAML.parse(await file.text()) as { profiles?: { default?: { token?: string } } };
    return parsed?.profiles?.default?.token ?? null;
  }

  private async publish(
    dir: string,
    access: NpmAccessType,
    token: string,
    label: string,
    silent?: boolean,
  ): Promise<boolean> {
    const spinner = silent ? null : createSpinner(`Publishing ${label} to npm...`);

    const proc = Bun.spawn(
      ["bun", "publish", "--access", access, "--tolerate-republish", "--force", "--production"],
      {
        cwd: dir,
        stdout: "ignore",
        stderr: "ignore",
        env: { ...process.env, [`npm_config_//${NPM_REGISTRY}/:_authToken`]: token },
      },
    );

    const exitCode = await proc.exited;
    spinner?.stop();

    if (exitCode !== 0) {
      if (!silent) {
        const logger = new TerminalLogger();
        logger.error(`Failed to publish ${label} (bun publish exited with code ${exitCode})`, undefined, LOG_OPTIONS);
      }
      return false;
    }

    return true;
  }
}
