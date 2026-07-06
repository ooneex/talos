import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { createSpinner, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  packages?: string;
  modules?: string;
  tag?: string;
  silent?: boolean;
};

type TargetType = {
  base: string;
  type: "package" | "module";
  name: string;
};

type DockerCredentialsType = {
  registry: string;
  username: string;
  token: string;
};

const DEFAULT_REGISTRY = "docker.io";

@decorator.command()
export class DockerPublishCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "docker:publish";
  }

  public getDescription(): string {
    return "Build and push a package or module Docker image to Docker Hub";
  }

  public async run(options: T): Promise<void> {
    const { packages, modules, tag, silent } = options;
    const logger = new TerminalLogger();
    const log = (level: "error" | "success" | "info", message: string): void => {
      if (!silent) {
        logger[level](message, undefined, LOG_OPTIONS);
      }
    };

    const targets = await this.resolveTargets(packages, modules);
    if (targets.length === 0) {
      log("error", "No packages or modules found to publish");
      process.exitCode = 1;
      return;
    }

    const credentials = await this.readCredentials();
    if (!credentials) {
      log("error", "No Docker credentials found. Run `talos docker:credentials:create` first.");
      process.exitCode = 1;
      return;
    }

    // Authenticate once up front so every build/push shares the same session.
    const loggedIn = await this.login(credentials, silent);
    if (!loggedIn.ok) {
      if (!silent) {
        logger.error("Docker login failed", loggedIn.output ? { message: loggedIn.output } : undefined, LOG_OPTIONS);
      }
      process.exitCode = 1;
      return;
    }

    let succeeded = 0;
    let ignored = 0;

    for (const target of targets) {
      const targetDir = join(process.cwd(), target.base);
      const dockerfile = Bun.file(join(targetDir, "Dockerfile"));

      // Only directories that ship a Dockerfile can be built. An explicitly
      // requested target without one is an error; discovered targets are simply
      // skipped (they are ordinary packages with nothing to containerize).
      if (!(await dockerfile.exists())) {
        if (this.isExplicit(target, packages, modules)) {
          log("error", `No Dockerfile found for ${target.type} "${target.name}"`);
        } else {
          ignored++;
        }
        continue;
      }

      const image = await this.resolveImage(targetDir, target.name, credentials, tag);

      const published = await this.publish(targetDir, image.ref, silent).catch((error) => ({
        ok: false,
        output: error instanceof Error ? error.message : String(error),
      }));
      if (published.ok) {
        succeeded++;
        log("success", `Published ${image.ref}`);
      } else if (!silent) {
        logger.error(
          `Failed to publish ${image.ref}`,
          published.output ? { message: published.output } : undefined,
          LOG_OPTIONS,
        );
      }
    }

    log("info", `Summary: ${succeeded} published, ${ignored} ignored`);
  }

  // Build the list of targets to publish. With neither `--packages` nor `--modules`, every
  // package and module is considered (those without a Dockerfile are skipped later). Each
  // flag accepts a comma-separated list of names.
  private async resolveTargets(packages?: string, modules?: string): Promise<TargetType[]> {
    if (packages === undefined && modules === undefined) {
      return [...(await this.discover("packages", "package")), ...(await this.discover("modules", "module"))];
    }

    const targets: TargetType[] = [];

    for (const name of this.split(packages)) {
      targets.push({ base: join("packages", name), type: "package", name });
    }
    for (const name of this.split(modules)) {
      targets.push({ base: join("modules", name), type: "module", name });
    }

    return targets;
  }

  // Every directory under `packages/` or `modules/` becomes a candidate target.
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

  // A target is explicit when its name appears in the flag matching its kind.
  private isExplicit(target: TargetType, packages?: string, modules?: string): boolean {
    const list = target.type === "package" ? packages : modules;
    return this.split(list).includes(target.name);
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

  // Build the fully-qualified image reference. The Docker Hub registry needs no
  // prefix; any other registry is prepended so the push lands on the right host.
  // The tag defaults to the package.json version, falling back to `latest`.
  private async resolveImage(
    dir: string,
    name: string,
    credentials: DockerCredentialsType,
    tag?: string,
  ): Promise<{ ref: string }> {
    const pkgJsonFile = Bun.file(join(dir, "package.json"));
    const version = (await pkgJsonFile.exists())
      ? ((await pkgJsonFile.json()) as { version?: string }).version
      : undefined;

    const resolvedTag = tag ?? version ?? "latest";
    const repository = `${credentials.username}/${name}`;
    const image =
      credentials.registry === DEFAULT_REGISTRY || credentials.registry === ""
        ? repository
        : `${credentials.registry}/${repository}`;

    return { ref: `${image}:${resolvedTag}` };
  }

  private async readCredentials(): Promise<DockerCredentialsType | null> {
    const credentialsPath = join(homedir(), ".talos", "credentials", "docker.yml");
    const file = Bun.file(credentialsPath);

    if (!(await file.exists())) {
      return null;
    }

    const parsed = Bun.YAML.parse(await file.text()) as {
      profiles?: { default?: { registry?: string; username?: string; token?: string } };
    };
    const profile = parsed?.profiles?.default;
    if (!profile?.username || !profile?.token) {
      return null;
    }

    return {
      registry: profile.registry ?? DEFAULT_REGISTRY,
      username: profile.username,
      token: profile.token,
    };
  }

  // Authenticate against the registry, feeding the token through stdin so it
  // never appears in the process arguments.
  private async login(credentials: DockerCredentialsType, silent?: boolean): Promise<{ ok: boolean; output: string }> {
    const spinner = silent ? null : createSpinner(`Logging in to ${credentials.registry}...`);

    try {
      return await this.spawn(
        ["docker", "login", credentials.registry, "--username", credentials.username, "--password-stdin"],
        process.cwd(),
        credentials.token,
      );
    } finally {
      spinner?.stop();
    }
  }

  private async publish(dir: string, ref: string, silent?: boolean): Promise<{ ok: boolean; output: string }> {
    const spinner = silent ? null : createSpinner(`Building and pushing ${ref}...`);

    try {
      const built = await this.spawn(["docker", "build", "-t", ref, "."], dir);
      if (!built.ok) {
        return built;
      }

      return await this.spawn(["docker", "push", ref], dir);
    } finally {
      spinner?.stop();
    }
  }

  // Spawn a command, optionally feeding `stdin`. Output is captured (not streamed)
  // so the spinner stays clean and the details can be surfaced when it fails.
  private async spawn(cmd: string[], cwd: string, stdin?: string): Promise<{ ok: boolean; output: string }> {
    const proc = Bun.spawn(cmd, {
      cwd,
      stdin: stdin === undefined ? "inherit" : new TextEncoder().encode(stdin),
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    const output = [stdout, stderr]
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\n");

    return { ok: exitCode === 0, output };
  }
}
