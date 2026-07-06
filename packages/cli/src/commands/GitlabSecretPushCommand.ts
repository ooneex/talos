import { homedir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { askInput } from "../prompts/askInput";
import { askPassword } from "../prompts/askPassword";
import { createSpinner, LOG_OPTIONS, readGitOriginUrl } from "../utils";

type CommandOptionsType = {
  name?: string;
  value?: string;
  silent?: boolean;
};

type GitlabProjectType = {
  host: string;
  path: string;
};

@decorator.command()
export class GitlabSecretPushCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "gitlab:secret:push";
  }

  public getDescription(): string {
    return "Create or update a GitLab CI/CD variable on a project";
  }

  public async run(options: T): Promise<void> {
    let { name, value } = options;
    const { silent } = options;
    const logger = new TerminalLogger();

    const token = await this.readToken();
    if (!token) {
      if (!silent) {
        logger.error(
          "No GitLab credentials found. Run `talos gitlab:credentials:create` first.",
          undefined,
          LOG_OPTIONS,
        );
      }
      process.exitCode = 1;
      return;
    }

    const project = await this.detectProject();
    if (!project) {
      if (!silent) {
        logger.error(
          "Could not determine the GitLab project from `.git/config` in the current directory.",
          undefined,
          LOG_OPTIONS,
        );
      }
      process.exitCode = 1;
      return;
    }

    if (!name) {
      name = await askInput({ message: "Enter variable name" });
    }

    if (!value) {
      value = await askPassword({ message: "Enter variable value" });
    }

    const spinner = silent ? null : createSpinner(`Pushing variable "${name}" to ${project.path}...`);
    let result: { ok: boolean; output: string };
    try {
      result = await this.pushVariable(project, name, value, token);
    } finally {
      spinner?.stop();
    }

    if (!result.ok) {
      if (!silent) {
        logger.error(
          `Failed to push variable "${name}" to ${project.path}`,
          result.output ? { message: result.output } : undefined,
          LOG_OPTIONS,
        );
      }
      process.exitCode = 1;
      return;
    }

    if (!silent) {
      logger.success(`Variable "${name}" pushed to ${project.path}`, undefined, LOG_OPTIONS);
      logger.info(`View it at https://${project.host}/${project.path}/-/settings/ci_cd`, undefined, LOG_OPTIONS);
    }
  }

  private async readToken(): Promise<string | null> {
    const file = Bun.file(join(homedir(), ".talos", "credentials", "gitlab.yml"));
    if (!(await file.exists())) {
      return null;
    }

    const parsed = Bun.YAML.parse(await file.text()) as {
      profiles?: { default?: { token?: string } };
    };
    return parsed?.profiles?.default?.token ?? null;
  }

  private async detectProject(): Promise<GitlabProjectType | null> {
    const url = await readGitOriginUrl(process.cwd());
    return url ? this.parseProject(url) : null;
  }

  // Parse the host and project path (which may include nested subgroups) from a
  // GitLab HTTPS or SSH remote URL, so self-managed instances work too.
  private parseProject(input: string): GitlabProjectType | null {
    const remote = input
      .trim()
      .replace(/\.git$/, "")
      .replace(/\/$/, "");

    const ssh = /^(?:ssh:\/\/)?git@([^/:]+)[:/](.+)$/.exec(remote);
    const https = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/.exec(remote);
    const host = ssh?.[1] ?? https?.[1];
    const path = ssh?.[2] ?? https?.[2];

    if (!host || !path) {
      return null;
    }

    // A GitLab project path is at least `group/project`.
    return /^[^/\s]+\/[^\s]+$/.test(path) ? { host, path } : null;
  }

  // Create the CI/CD variable via the GitLab API; if the key already exists,
  // update it in place. Values are masked so they are hidden in job logs.
  private async pushVariable(
    project: GitlabProjectType,
    name: string,
    value: string,
    token: string,
  ): Promise<{ ok: boolean; output: string }> {
    const base = `https://${project.host}/api/v4/projects/${encodeURIComponent(project.path)}/variables`;
    const headers = { "PRIVATE-TOKEN": token, "Content-Type": "application/json" };

    try {
      const created = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ key: name, value, masked: true, protected: false }),
      });
      if (created.ok) {
        return { ok: true, output: "" };
      }

      const createdBody = (await created.text()).trim();
      if (created.status === 400 && /has already been taken/i.test(createdBody)) {
        const updated = await fetch(`${base}/${encodeURIComponent(name)}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ value, masked: true, protected: false }),
        });
        if (updated.ok) {
          return { ok: true, output: "" };
        }
        return { ok: false, output: `HTTP ${updated.status}: ${(await updated.text()).trim()}` };
      }

      return { ok: false, output: `HTTP ${created.status}: ${createdBody}` };
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : String(error) };
    }
  }
}
