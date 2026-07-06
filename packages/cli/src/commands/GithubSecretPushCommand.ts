import { homedir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { askInput } from "../prompts/askInput";
import { askPassword } from "../prompts/askPassword";
import { createSpinner, ensureBin, LOG_OPTIONS, readGitOriginUrl } from "../utils";

type CommandOptionsType = {
  name?: string;
  value?: string;
  silent?: boolean;
};

@decorator.command()
export class GithubSecretPushCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "github:secret:push";
  }

  public getDescription(): string {
    return "Create or update a GitHub Actions secret on a repository";
  }

  public async run(options: T): Promise<void> {
    let { name, value } = options;
    const { silent } = options;
    const logger = new TerminalLogger();

    // `gh` performs the local encryption GitHub requires before the secret is
    // uploaded, so it must be on the PATH.
    if (!ensureBin(logger, "gh", silent)) {
      return;
    }

    const token = await this.readToken();
    if (!token) {
      if (!silent) {
        logger.error(
          "No GitHub credentials found. Run `talos github:credentials:create` first.",
          undefined,
          LOG_OPTIONS,
        );
      }
      process.exitCode = 1;
      return;
    }

    const slug = await this.detectRepository();
    if (!slug) {
      if (!silent) {
        logger.error(
          "Could not determine the GitHub repository from `.git/config` in the current directory.",
          undefined,
          LOG_OPTIONS,
        );
      }
      process.exitCode = 1;
      return;
    }

    if (!name) {
      name = await askInput({ message: "Enter secret name" });
    }

    if (!value) {
      value = await askPassword({ message: "Enter secret value" });
    }

    const spinner = silent ? null : createSpinner(`Pushing secret "${name}" to ${slug}...`);
    let result: { ok: boolean; output: string };
    try {
      result = await this.pushSecret(slug, name, value, token);
    } finally {
      spinner?.stop();
    }

    if (!result.ok) {
      if (!silent) {
        logger.error(
          `Failed to push secret "${name}" to ${slug}`,
          result.output ? { message: result.output } : undefined,
          LOG_OPTIONS,
        );
      }
      process.exitCode = 1;
      return;
    }

    if (!silent) {
      logger.success(`Secret "${name}" pushed to ${slug}`, undefined, LOG_OPTIONS);
      logger.info(`View it at https://github.com/${slug}/settings/secrets/actions`, undefined, LOG_OPTIONS);
    }
  }

  private async readToken(): Promise<string | null> {
    const credentialsPath = join(homedir(), ".talos", "credentials", "github.yml");
    const file = Bun.file(credentialsPath);

    if (!(await file.exists())) {
      return null;
    }

    const parsed = Bun.YAML.parse(await file.text()) as {
      profiles?: { default?: { token?: string } };
    };
    return parsed?.profiles?.default?.token ?? null;
  }

  // Resolve the target repository from the `origin` remote in `.git/config` in
  // the current directory, reducing it to an `owner/repo` slug.
  private async detectRepository(): Promise<string | null> {
    const url = await readGitOriginUrl(process.cwd());
    return url ? this.normalizeRepository(url) : null;
  }

  // Reduce a GitHub URL or SSH remote to the canonical `owner/repo` slug,
  // returning null when it cannot be parsed.
  private normalizeRepository(input: string): string | null {
    const slug = input
      .trim()
      .replace(/^git@github\.com:/, "")
      .replace(/^https?:\/\/github\.com\//, "")
      .replace(/^ssh:\/\/git@github\.com\//, "")
      .replace(/\.git$/, "")
      .replace(/\/$/, "");

    return /^[^/\s]+\/[^/\s]+$/.test(slug) ? slug : null;
  }

  // Feed the secret value through stdin so it never appears in the process
  // arguments; `gh` encrypts it locally before uploading. The stored PAT is
  // passed via `GH_TOKEN` so `gh` authenticates with it instead of its own login.
  private async pushSecret(
    slug: string,
    name: string,
    value: string,
    token: string,
  ): Promise<{ ok: boolean; output: string }> {
    const proc = Bun.spawn(["gh", "secret", "set", name, "--repo", slug], {
      cwd: process.cwd(),
      stdin: new TextEncoder().encode(value),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, GH_TOKEN: token },
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
