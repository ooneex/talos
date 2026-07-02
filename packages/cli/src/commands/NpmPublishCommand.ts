import { readdir } from "node:fs/promises";
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
    const log = (level: "error" | "success" | "info", message: string): void => {
      if (!silent) {
        logger[level](message, undefined, LOG_OPTIONS);
      }
    };

    const targets = await this.resolveTargets(pkg, module);
    if (targets.length === 0) {
      log("error", "No packages or modules found to publish");
      process.exitCode = 1;
      return;
    }

    const token = await this.readToken();
    if (!token) {
      log("error", "No npm credentials found. Run `talos npm:credentials:create` first.");
      process.exitCode = 1;
      return;
    }

    let succeeded = 0;
    let ignored = 0;

    for (const target of targets) {
      const targetDir = join(process.cwd(), target.base);
      const pkgJsonFile = Bun.file(join(targetDir, "package.json"));

      if (!(await pkgJsonFile.exists())) {
        log("error", `No ${target.type} named "${target.name}" found`);
        continue;
      }

      const pkgJson: { name?: string; version?: string } = await pkgJsonFile.json();
      const name = pkgJson.name ?? target.name;
      const label = pkgJson.version ? `${name}@${pkgJson.version}` : name;

      // Skip versions already on the registry without logging noise.
      if (pkgJson.version && (await this.versionExists(name, pkgJson.version, token))) {
        ignored++;
        continue;
      }

      const published = await this.publish(targetDir, access, token, label, silent).catch(() => false);
      if (published) {
        succeeded++;
        log("success", `Published ${label}`);
      } else {
        log("error", `Failed to publish ${label}`);
      }
    }

    log("info", `Summary: ${succeeded} published, ${ignored} ignored`);
  }

  // Build the list of targets to publish. With neither `--package` nor `--module`, every
  // package and module is published. Each flag accepts a comma-separated list of names.
  private async resolveTargets(pkg?: string, module?: string): Promise<TargetType[]> {
    if (pkg === undefined && module === undefined) {
      return [...(await this.discover("packages", "package")), ...(await this.discover("modules", "module"))];
    }

    const targets: TargetType[] = [];

    for (const name of this.split(pkg)) {
      targets.push({ base: join("packages", name), type: "package", name });
    }
    for (const name of this.split(module)) {
      targets.push({ base: join("modules", name), type: "module", name });
    }

    return targets;
  }

  // Every directory under `packages/` or `modules/` becomes a target.
  private async discover(dirName: string, type: TargetType["type"]): Promise<TargetType[]> {
    try {
      const entries = await readdir(join(process.cwd(), dirName), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ base: join(dirName, entry.name), type, name: entry.name }));
    } catch {
      return [];
    }
  }

  private split(value?: string): string[] {
    if (!value) {
      return [];
    }
    return value
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }

  // Query the registry for a specific version. A 200 means it is already published,
  // so the caller can skip it. Network failures fall through to a publish attempt.
  private async versionExists(name: string, version: string, token: string): Promise<boolean> {
    const url = `https://${NPM_REGISTRY}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;

    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      return res.ok;
    } catch {
      return false;
    }
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

    try {
      const proc = Bun.spawn(
        ["bun", "publish", "--access", access, "--tolerate-republish", "--force", "--production"],
        {
          cwd: dir,
          stdout: "ignore",
          stderr: "ignore",
          env: { ...process.env, [`npm_config_//${NPM_REGISTRY}/:_authToken`]: token },
        },
      );

      return (await proc.exited) === 0;
    } finally {
      spinner?.stop();
    }
  }
}
