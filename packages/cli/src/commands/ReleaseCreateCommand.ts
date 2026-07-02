import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { $ } from "bun";
import { askConfirm } from "../prompts/askConfirm";
import { LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  module?: string;
  package?: string;
};

type PackageJsonType = {
  name: string;
  version: string;
  [key: string]: unknown;
};

type CommitInfoType = {
  hash: string;
  type: string;
  scope: string;
  subject: string;
  author: string;
  breaking?: boolean;
};

type ChangelogCategory = "Added" | "Changed" | "Deprecated" | "Removed" | "Fixed" | "Security";

const COMMIT_TYPE_TO_CATEGORY: Record<string, ChangelogCategory> = {
  feat: "Added",
  fix: "Fixed",
  refactor: "Changed",
  perf: "Changed",
  style: "Changed",
  docs: "Changed",
  build: "Changed",
  ci: "Changed",
  chore: "Changed",
  revert: "Removed",
};

@decorator.command()
export class ReleaseCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "release:create";
  }

  public getDescription(): string {
    return "Release packages with version bump, changelog, and git tag";
  }

  public async run(options?: T): Promise<void> {
    const { module, package: pkg } = options ?? {};
    const logger = new TerminalLogger();
    const cwd = process.cwd();

    const dirs: { base: string; type: string }[] = [];

    for (const { name, type } of [
      { name: "packages", type: "package" },
      { name: "modules", type: "module" },
    ]) {
      try {
        const entries = await readdir(join(cwd, name), { withFileTypes: true });
        dirs.push(...entries.filter((d) => d.isDirectory()).map((d) => ({ base: join(name, d.name), type })));
      } catch {
        // Directory doesn't exist
      }
    }

    if (dirs.length === 0) {
      logger.error("No packages or modules found", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const hasFilter = module !== undefined || pkg !== undefined;
    const targetDirs = hasFilter
      ? dirs.filter(
          (dir) =>
            (pkg !== undefined && dir.type === "package" && basename(dir.base) === pkg) ||
            (module !== undefined && dir.type === "module" && basename(dir.base) === module),
        )
      : dirs;

    if (targetDirs.length === 0) {
      const requested = [pkg !== undefined && `package "${pkg}"`, module !== undefined && `module "${module}"`]
        .filter(Boolean)
        .join(" or ");
      logger.error(`No ${requested} found`, undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    let releasedCount = 0;

    for (const dir of targetDirs) {
      const fullDir = join(cwd, dir.base);
      const pkgJsonPath = join(fullDir, "package.json");

      const pkgJsonFile = Bun.file(pkgJsonPath);
      if (!(await pkgJsonFile.exists())) {
        continue;
      }

      const pkgJson: PackageJsonType = await pkgJsonFile.json();
      const lastTag = await this.getLastTag(pkgJson.name);
      const commits = await this.getCommitsSinceTag(lastTag, dir.base);

      if (commits.length === 0) {
        continue;
      }

      const bumpType = this.determineBumpType(commits);
      const newVersion = this.bumpVersion(pkgJson.version, bumpType);

      pkgJson.version = newVersion;
      const tag = `${pkgJson.name}@${newVersion}`;

      await Bun.write(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
      await this.updateChangelog(fullDir, newVersion, tag, commits);

      await this.gitAdd(join(dir.base, "package.json"), join(dir.base, "CHANGELOG.md"));
      await this.gitCommit(`chore(release): ${pkgJson.name}@${newVersion}`);
      await this.gitTag(tag, `chore(release): ${pkgJson.name}@${newVersion}`);

      logger.success(
        `${pkgJson.name}@${newVersion} released (${bumpType} bump, ${commits.length} commit(s))`,
        undefined,
        LOG_OPTIONS,
      );

      releasedCount++;
    }

    if (releasedCount === 0) {
      logger.info("No packages have unreleased commits\n", undefined, {
        showArrow: false,
        showTimestamp: false,
        showLevel: false,
        useSymbol: false,
      });
      return;
    }

    logger.success(`${releasedCount} package(s) released`, undefined, LOG_OPTIONS);

    const shouldPush = await askConfirm({ message: "Push commits and tags to remote?", initial: true });

    if (shouldPush) {
      try {
        await this.bunInstall();
        await this.gitAdd("bun.lock");
        await this.gitCommit("chore(common): Update bun.lock");
        logger.success("Updated and committed bun.lock", undefined, LOG_OPTIONS);
        await this.gitPush();
        logger.success("Pushed commits and tags to remote", undefined, LOG_OPTIONS);
      } catch {
        logger.error("Failed to push to remote", undefined, LOG_OPTIONS);
        process.exitCode = 1;
      }
    }
  }

  private async getLastTag(packageName: string): Promise<string | null> {
    try {
      const result = await $`git --no-pager tag --list "${packageName}@*" --sort=-v:refname`.quiet();
      const tags = result.text().trim();

      if (!tags) {
        return null;
      }

      return tags.split("\n")[0] ?? null;
    } catch {
      return null;
    }
  }

  private async getCommitsSinceTag(tag: string | null, dirPath: string): Promise<CommitInfoType[]> {
    const range = tag ? `${tag}..HEAD` : "HEAD";
    const format = "%H|%an|%s|%b%x1e";

    try {
      const result = await $`git --no-pager log ${range} --format=${format} -- ${dirPath}`.quiet();
      const output = result.text().trim();

      if (!output) {
        return [];
      }

      const commits: CommitInfoType[] = [];
      const conventionalRegex = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

      for (const record of output.split("\x1e")) {
        const entry = record.trim();
        if (!entry) {
          continue;
        }

        const [hash, author, ...rest] = entry.split("|");
        const [subject = "", ...bodyLines] = rest.join("|").split("\n");
        const body = bodyLines.join("\n");

        if (!hash || !author || !subject) {
          continue;
        }

        const match = subject.match(conventionalRegex);
        if (match) {
          const [, type, scope, bang, message] = match;
          if (type && message) {
            const breaking = bang === "!" || /^BREAKING[ -]CHANGE:/m.test(body);
            commits.push({ hash: hash.substring(0, 8), type, scope: scope ?? "", subject: message, author, breaking });
          }
        }
      }

      return commits;
    } catch {
      return [];
    }
  }

  private determineBumpType(commits: CommitInfoType[]): "major" | "minor" | "patch" {
    let bump: "major" | "minor" | "patch" = "patch";

    for (const commit of commits) {
      if (commit.breaking) {
        return "major";
      }
      if (commit.type === "feat") {
        bump = "minor";
      }
    }

    return bump;
  }

  private bumpVersion(version: string, type: "major" | "minor" | "patch"): string {
    const parts = version.split(".").map(Number);
    const [major = 0, minor = 0, patch = 0] = parts;

    if (type === "major") {
      return `${major + 1}.0.0`;
    }

    if (type === "minor") {
      return `${major}.${minor + 1}.0`;
    }

    return `${major}.${minor}.${patch + 1}`;
  }

  private async getRepoUrl(): Promise<string | null> {
    try {
      const result = await $`git --no-pager remote get-url origin`.quiet();
      const url = result.text().trim();

      return url.replace(/\.git$/, "").replace(/^git@([^:]+):/, "https://$1/");
    } catch {
      return null;
    }
  }

  private async updateChangelog(dir: string, version: string, tag: string, commits: CommitInfoType[]): Promise<void> {
    const changelogPath = join(dir, "CHANGELOG.md");
    const today = new Date().toISOString().split("T")[0];
    const repoUrl = await this.getRepoUrl();

    const grouped = new Map<ChangelogCategory, CommitInfoType[]>();
    for (const commit of commits) {
      const category = COMMIT_TYPE_TO_CATEGORY[commit.type] ?? "Changed";
      const existing = grouped.get(category) ?? [];
      existing.push(commit);
      grouped.set(category, existing);
    }

    const categoryOrder: ChangelogCategory[] = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];
    const versionLink = repoUrl ? `[${version}](${repoUrl}/releases/tag/${tag})` : `[${version}]`;
    let section = `## ${versionLink} - ${today}\n`;

    for (const category of categoryOrder) {
      const categoryCommits = grouped.get(category);
      if (!categoryCommits || categoryCommits.length === 0) {
        continue;
      }

      section += `\n### ${category}\n\n`;
      for (const commit of categoryCommits) {
        const link = repoUrl ? ` ([${commit.hash}](${repoUrl}/commit/${commit.hash}))` : "";
        section += `- ${commit.subject} — ${commit.author}${link}\n`;
      }
    }

    const changelogFile = Bun.file(changelogPath);
    let existingContent = "";
    if (await changelogFile.exists()) {
      existingContent = await changelogFile.text();
    }

    let newContent: string;

    if (existingContent) {
      const unreleasedMatch = existingContent.match(/## \[Unreleased\][^\n]*\n/);
      const firstVersionMatch = existingContent.match(/## \[\d+\.\d+\.\d+\]/);

      if (unreleasedMatch) {
        const insertIndex = (unreleasedMatch.index ?? 0) + unreleasedMatch[0].length;
        newContent = `${existingContent.slice(0, insertIndex)}\n${section}\n${existingContent.slice(insertIndex)}`;
      } else if (firstVersionMatch && firstVersionMatch.index !== undefined) {
        newContent = `${existingContent.slice(0, firstVersionMatch.index)}${section}\n${existingContent.slice(firstVersionMatch.index)}`;
      } else {
        newContent = `${existingContent.trimEnd()}\n\n${section}\n`;
      }
    } else {
      newContent = `# Changelog

${section}
`;
    }

    await Bun.write(changelogPath, newContent);
  }

  private async gitAdd(...files: string[]): Promise<void> {
    await $`git add ${files}`;
  }

  private async gitCommit(message: string): Promise<void> {
    await $`git commit --no-verify -m ${message}`;
  }

  private async gitTag(tag: string, message: string): Promise<void> {
    await $`git tag -a ${tag} -m ${message}`;
  }

  private async bunInstall(): Promise<void> {
    await $`bun install`;
  }

  private async gitPush(): Promise<void> {
    await $`git push && git push --tags`;
  }
}
