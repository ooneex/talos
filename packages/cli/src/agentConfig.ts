import { cp, mkdir, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { TerminalLogger } from "@talosjs/logger";
import { resolveAdapter, type ScaffoldInput, type SkillInput } from "./templates/llm/assistants";
import { LOG_OPTIONS, spawnStep } from "./utils";

export const SKELETON_REPO_URL = "https://github.com/ooneex/skeleton.git";

let skeletonDirPromise: Promise<string | null> | null = null;

const cloneSkeleton = async (logger: TerminalLogger, silent?: boolean): Promise<string | null> => {
  const parentDir = await mkdtemp(join(tmpdir(), "talos-skeleton-"));
  const destination = join(parentDir, "repo");

  const cloned = await spawnStep(
    logger,
    ["git", "clone", "--depth", "1", SKELETON_REPO_URL, destination],
    parentDir,
    {
      start: "Cloning skeleton repository...",
      failure: (exitCode) => `Failed to clone skeleton repository (exit code: ${exitCode})`,
    },
    { silent },
  );

  return cloned ? destination : null;
};

export const getSkeletonDir = async (logger: TerminalLogger, silent?: boolean): Promise<string | null> => {
  skeletonDirPromise ??= cloneSkeleton(logger, silent);

  return skeletonDirPromise;
};

export const resetSkeletonDirCache = (): void => {
  skeletonDirPromise = null;
};

export const copySkeletonPath = async (
  skeletonDir: string,
  sourceRelativePath: string,
  destinationPath: string,
): Promise<void> => {
  await mkdir(dirname(destinationPath), { recursive: true });
  await cp(join(skeletonDir, sourceRelativePath), destinationPath, { force: true, recursive: true });
};

export const readSkeletonFile = async (skeletonDir: string, relativePath: string): Promise<string> =>
  Bun.file(join(skeletonDir, relativePath)).text();

export const readSkeletonAgents = async (skeletonDir: string): Promise<Record<string, string>> => {
  const agentsDir = join(skeletonDir, ".claude", "agents");
  const entries = await readdir(agentsDir, { withFileTypes: true });
  const agents = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => [basename(entry.name, ".md"), await Bun.file(join(agentsDir, entry.name)).text()] as const),
  );

  return Object.fromEntries(agents);
};

const readSkillReferences = async (
  skillsDir: string,
  entryName: string,
): Promise<Record<string, string> | undefined> => {
  const referencesDir = join(skillsDir, entryName, "references");
  const references = await Array.fromAsync(new Bun.Glob("*").scan({ cwd: referencesDir, onlyFiles: true })).catch(
    () => [],
  );

  if (references.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    await Promise.all(
      references
        .sort((left, right) => left.localeCompare(right))
        .map(async (reference) => [reference, await Bun.file(join(referencesDir, reference)).text()] as const),
    ),
  );
};

const readSkeletonSkills = async (skeletonDir: string): Promise<Record<string, SkillInput>> => {
  const skillsDir = join(skeletonDir, ".claude", "skills");
  const entries = await readdir(skillsDir, { withFileTypes: true });

  return Object.fromEntries(
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(async (entry) => {
          const source = await Bun.file(join(skillsDir, entry.name, "SKILL.md")).text();
          const references = await readSkillReferences(skillsDir, entry.name);
          return [entry.name, references ? { source, references } : { source }] as const;
        }),
    ),
  );
};

export const loadScaffoldInput = async (
  cwd = process.cwd(),
  options?: { appName?: string; silent?: boolean; sourceDir?: string },
): Promise<ScaffoldInput | null> => {
  const logger = new TerminalLogger();
  const skeletonDir = options?.sourceDir ?? (await getSkeletonDir(logger, options?.silent));

  if (!skeletonDir) {
    return null;
  }

  const projectName = options?.appName ?? basename(cwd);
  const agentsMd = (await readSkeletonFile(skeletonDir, "AGENTS.md")).replace(/{{NAME}}/g, projectName);

  return {
    agentsMd,
    agents: await readSkeletonAgents(skeletonDir),
    skills: await readSkeletonSkills(skeletonDir),
  };
};

/**
 * Scaffold the shared AGENTS.md, agent files and skills into an assistant config
 * directory (e.g. ".claude" or ".codex"). Each assistant gets its native layout
 * and file format via its adapter; assistants without a dedicated adapter fall
 * back to the Claude-style layout. All files are written concurrently since they
 * target independent paths.
 */
export const scaffoldAgentConfig = async (
  configDir: string,
  cwd = process.cwd(),
  options?: { appName?: string; silent?: boolean; sourceDir?: string },
): Promise<void> => {
  const logger = new TerminalLogger();
  const input = await loadScaffoldInput(cwd, options);

  if (!input) {
    logger.error(`Skipping ${configDir} scaffold because the skeleton source is unavailable.`, undefined, LOG_OPTIONS);
    return;
  }

  const files = resolveAdapter(configDir)(input, configDir);

  await Promise.all(
    files.map((file) =>
      Bun.write(join(cwd, file.path), file.content).then(() =>
        logger.success(`${file.path} created successfully`, undefined, LOG_OPTIONS),
      ),
    ),
  );
};
