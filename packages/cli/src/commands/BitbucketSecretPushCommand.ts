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

type BitbucketRepoType = {
  workspace: string;
  slug: string;
};

type BitbucketCredentialsType = {
  username: string;
  token: string;
};

@decorator.command()
export class BitbucketSecretPushCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "bitbucket:secret:push";
  }

  public getDescription(): string {
    return "Create or update a Bitbucket Pipelines repository variable";
  }

  public async run(options: T): Promise<void> {
    let { name, value } = options;
    const { silent } = options;
    const logger = new TerminalLogger();

    const credentials = await this.readCredentials();
    if (!credentials) {
      if (!silent) {
        logger.error(
          "No Bitbucket credentials found. Run `talos bitbucket:credentials:create` first.",
          undefined,
          LOG_OPTIONS,
        );
      }
      process.exitCode = 1;
      return;
    }

    const repo = await this.detectRepository();
    if (!repo) {
      if (!silent) {
        logger.error(
          "Could not determine the Bitbucket repository from `.git/config` in the current directory.",
          undefined,
          LOG_OPTIONS,
        );
      }
      process.exitCode = 1;
      return;
    }

    const slug = `${repo.workspace}/${repo.slug}`;

    if (!name) {
      name = await askInput({ message: "Enter variable name" });
    }

    if (!value) {
      value = await askPassword({ message: "Enter variable value" });
    }

    const spinner = silent ? null : createSpinner(`Pushing variable "${name}" to ${slug}...`);
    let result: { ok: boolean; output: string };
    try {
      result = await this.pushVariable(repo, name, value, credentials);
    } finally {
      spinner?.stop();
    }

    if (!result.ok) {
      if (!silent) {
        logger.error(
          `Failed to push variable "${name}" to ${slug}`,
          result.output ? { message: result.output } : undefined,
          LOG_OPTIONS,
        );
      }
      process.exitCode = 1;
      return;
    }

    if (!silent) {
      logger.success(`Variable "${name}" pushed to ${slug}`, undefined, LOG_OPTIONS);
      logger.info(
        `View it at https://bitbucket.org/${slug}/admin/pipelines/repository-variables`,
        undefined,
        LOG_OPTIONS,
      );
    }
  }

  private async readCredentials(): Promise<BitbucketCredentialsType | null> {
    const file = Bun.file(join(homedir(), ".talos", "credentials", "bitbucket.yml"));
    if (!(await file.exists())) {
      return null;
    }

    const parsed = Bun.YAML.parse(await file.text()) as {
      profiles?: { default?: { username?: string; token?: string } };
    };
    const profile = parsed?.profiles?.default;
    if (!profile?.username || !profile?.token) {
      return null;
    }

    return { username: profile.username, token: profile.token };
  }

  private async detectRepository(): Promise<BitbucketRepoType | null> {
    const url = await readGitOriginUrl(process.cwd());
    return url ? this.parseRepository(url) : null;
  }

  // Reduce a Bitbucket Cloud HTTPS or SSH remote to its `workspace` and repo
  // `slug`, returning null when the path is not exactly `workspace/slug`.
  private parseRepository(input: string): BitbucketRepoType | null {
    const remote = input
      .trim()
      .replace(/\.git$/, "")
      .replace(/\/$/, "");

    const ssh = /^(?:ssh:\/\/)?git@[^/:]+[:/](.+)$/.exec(remote);
    const https = /^https?:\/\/(?:[^@/]+@)?[^/]+\/(.+)$/.exec(remote);
    const path = ssh?.[1] ?? https?.[1];

    if (!path) {
      return null;
    }

    const parts = path.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }

    return { workspace: parts[0], slug: parts[1] };
  }

  // Create the Pipelines variable via the Bitbucket API; if it already exists,
  // look up its UUID and update it. Values are `secured` so they stay hidden.
  private async pushVariable(
    repo: BitbucketRepoType,
    name: string,
    value: string,
    credentials: BitbucketCredentialsType,
  ): Promise<{ ok: boolean; output: string }> {
    const base = `https://api.bitbucket.org/2.0/repositories/${repo.workspace}/${repo.slug}/pipelines_config/variables/`;
    const auth = `Basic ${Buffer.from(`${credentials.username}:${credentials.token}`).toString("base64")}`;
    const headers = { Authorization: auth, "Content-Type": "application/json" };

    try {
      const created = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ key: name, value, secured: true }),
      });
      if (created.ok) {
        return { ok: true, output: "" };
      }

      // A conflict means the variable already exists; update it by UUID.
      if (created.status === 409) {
        const uuid = await this.findVariableUuid(base, headers, name);
        if (!uuid) {
          return { ok: false, output: `Variable "${name}" exists but could not be located for update` };
        }
        const updated = await fetch(`${base}${uuid}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ key: name, value, secured: true }),
        });
        if (updated.ok) {
          return { ok: true, output: "" };
        }
        return { ok: false, output: `HTTP ${updated.status}: ${(await updated.text()).trim()}` };
      }

      return { ok: false, output: `HTTP ${created.status}: ${(await created.text()).trim()}` };
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : String(error) };
    }
  }

  // Page through the repository's variables to find the UUID for a given key.
  private async findVariableUuid(base: string, headers: Record<string, string>, name: string): Promise<string | null> {
    let url: string | null = `${base}?pagelen=100`;

    while (url) {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as {
        values?: { uuid?: string; key?: string }[];
        next?: string;
      };
      const found = (data.values ?? []).find((variable) => variable.key === name);
      if (found?.uuid) {
        return found.uuid;
      }
      url = data.next ?? null;
    }

    return null;
  }
}
