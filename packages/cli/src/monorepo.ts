import type { Dirent } from "node:fs";
import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Monorepo task engine backing the `monorepo:run` command. It reimplements the
 * parts of Nx the Talos workspace relies on — project discovery, a workspace
 * dependency graph and content-addressed task caching — with a more granular
 * hash: every non-artifact file of a target and of its transitive workspace
 * dependencies is content-hashed individually, together with the script text,
 * the root config files and a cache version. Cache entries live under
 * `var/cache/monorepo/<hash>/` and store the task's captured output plus its
 * output artifacts (`dist` by default) so hits replay logs and restore files.
 */

export type MonorepoTargetTypeName = "package" | "module";

export type MonorepoTargetType = {
  /** Unique key, e.g. `packages/billing`. */
  key: string;
  /** Directory name, e.g. `billing`. */
  name: string;
  type: MonorepoTargetTypeName;
  /** Absolute directory of the target. */
  dir: string;
  scripts: Record<string, string>;
  /** Keys of other discovered targets this one depends on. */
  workspaceDeps: string[];
  /** Directories (relative to the target) captured and restored by the cache. */
  outputs: string[];
};

export type CacheEntryMetaType = {
  version: number;
  target: string;
  command: string;
  hash: string;
  createdAt: string;
  durationMs: number;
  outputs: string[];
};

export const MONOREPO_CACHE_VERSION = 1;
export const MONOREPO_CACHE_DIR = join("var", "cache", "monorepo");

const TARGET_ROOTS: { dirName: string; type: MonorepoTargetTypeName }[] = [
  { dirName: "packages", type: "package" },
  { dirName: "modules", type: "module" },
];

// Build artifacts and dependency folders never participate in the input hash.
const EXCLUDED_DIRS = new Set(["node_modules", "dist", "var", "coverage", ".git", ".temp", ".turbo", ".nx"]);

// Root-level files whose content invalidates every task when they change.
const ROOT_INPUT_FILES = ["package.json", "bun.lock", "tsconfig.json", "biome.jsonc", "nx.json"];

const DEFAULT_OUTPUTS = ["dist"];

type PackageJsonType = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  talos?: { monorepo?: { outputs?: string[] } };
};

/**
 * Discover every package and module of the workspace rooted at `rootDir` that
 * has a package.json, and resolve their dependencies on one another (any
 * declared dependency whose name matches another discovered target).
 */
export const discoverTargets = async (rootDir: string): Promise<MonorepoTargetType[]> => {
  const targets: MonorepoTargetType[] = [];
  const keyByPackageName = new Map<string, string>();
  const declaredDeps = new Map<string, string[]>();

  for (const { dirName, type } of TARGET_ROOTS) {
    let entries: Dirent[];
    try {
      entries = await readdir(join(rootDir, dirName), { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dir = join(rootDir, dirName, entry.name);
      const packageJsonFile = Bun.file(join(dir, "package.json"));
      if (!(await packageJsonFile.exists())) continue;

      const packageJson: PackageJsonType = await packageJsonFile.json();
      const key = `${dirName}/${entry.name}`;

      if (packageJson.name) keyByPackageName.set(packageJson.name, key);
      declaredDeps.set(key, [
        ...Object.keys(packageJson.dependencies ?? {}),
        ...Object.keys(packageJson.devDependencies ?? {}),
        ...Object.keys(packageJson.peerDependencies ?? {}),
      ]);

      targets.push({
        key,
        name: entry.name,
        type,
        dir,
        scripts: packageJson.scripts ?? {},
        workspaceDeps: [],
        outputs: packageJson.talos?.monorepo?.outputs ?? DEFAULT_OUTPUTS,
      });
    }
  }

  for (const target of targets) {
    target.workspaceDeps = (declaredDeps.get(target.key) ?? [])
      .map((name) => keyByPackageName.get(name))
      .filter((key): key is string => key !== undefined && key !== target.key);
  }

  return targets;
};

/**
 * Order targets so every target comes after its workspace dependencies (the
 * equivalent of Nx's `dependsOn: ["^build"]`). Cycles are tolerated: members
 * of a cycle keep their discovery order.
 */
export const sortTargetsByDependencies = (targets: MonorepoTargetType[]): MonorepoTargetType[] => {
  const byKey = new Map(targets.map((target) => [target.key, target]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: MonorepoTargetType[] = [];

  const visit = (target: MonorepoTargetType): void => {
    if (visited.has(target.key) || visiting.has(target.key)) return;
    visiting.add(target.key);
    for (const depKey of target.workspaceDeps) {
      const dep = byKey.get(depKey);
      if (dep) visit(dep);
    }
    visiting.delete(target.key);
    visited.add(target.key);
    sorted.push(target);
  };

  for (const target of targets) visit(target);

  return sorted;
};

// List every hashable file of a directory, recursively, as sorted relative paths.
const collectFiles = async (dir: string, base = ""): Promise<string[]> => {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) files.push(...(await collectFiles(join(dir, entry.name), relPath)));
    } else if (entry.isFile()) {
      files.push(relPath);
    }
  }

  return files.sort();
};

const hashFile = async (path: string): Promise<string> => {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await Bun.file(path).arrayBuffer());
  return hasher.digest("hex");
};

/**
 * Content-hash every file of a target into a single fingerprint. Fingerprints
 * are memoized per target key in `memo` so shared dependencies are hashed once
 * per run.
 */
export const fingerprintTarget = (target: MonorepoTargetType, memo: Map<string, Promise<string>>): Promise<string> => {
  const memoized = memo.get(target.key);
  if (memoized) return memoized;

  const promise = (async () => {
    const files = await collectFiles(target.dir);
    const hasher = new Bun.CryptoHasher("sha256");
    for (const file of files) {
      hasher.update(`${file}=${await hashFile(join(target.dir, file))}\n`);
    }
    return hasher.digest("hex");
  })();

  memo.set(target.key, promise);
  return promise;
};

/** Fingerprint the root config files shared by every task of the workspace. */
export const hashRootInputs = async (rootDir: string): Promise<string> => {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const name of ROOT_INPUT_FILES) {
    const path = join(rootDir, name);
    if (await Bun.file(path).exists()) {
      hasher.update(`${name}=${await hashFile(path)}\n`);
    }
  }
  return hasher.digest("hex");
};

// Every workspace dependency reachable from the target, direct or transitive.
const transitiveDeps = (target: MonorepoTargetType, byKey: Map<string, MonorepoTargetType>): MonorepoTargetType[] => {
  const seen = new Set<string>([target.key]);
  const queue = [...target.workspaceDeps];
  const deps: MonorepoTargetType[] = [];

  while (queue.length > 0) {
    const key = queue.shift() as string;
    if (seen.has(key)) continue;
    seen.add(key);
    const dep = byKey.get(key);
    if (!dep) continue;
    deps.push(dep);
    queue.push(...dep.workspaceDeps);
  }

  return deps;
};

/**
 * Compute the cache hash of one task (`target` × `command`). The hash covers
 * the cache version, the script text, the target's own file fingerprint, the
 * fingerprints of all transitive workspace dependencies and the root inputs —
 * so a task re-runs exactly when something it can observe has changed.
 */
export const computeTaskHash = async (
  target: MonorepoTargetType,
  command: string,
  targets: MonorepoTargetType[],
  rootHash: string,
  memo: Map<string, Promise<string>>,
): Promise<string> => {
  const byKey = new Map(targets.map((entry) => [entry.key, entry]));
  const deps = transitiveDeps(target, byKey);
  const depLines = await Promise.all(deps.map(async (dep) => `${dep.key}=${await fingerprintTarget(dep, memo)}`));

  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(
    [
      `version=${MONOREPO_CACHE_VERSION}`,
      `target=${target.key}`,
      `command=${command}`,
      `script=${target.scripts[command] ?? ""}`,
      `root=${rootHash}`,
      `self=${await fingerprintTarget(target, memo)}`,
      ...depLines.sort(),
    ].join("\n"),
  );

  return hasher.digest("hex");
};

/** Read a cache entry, returning its metadata and replayable output, or null on miss. */
export const readCacheEntry = async (
  cacheDir: string,
  hash: string,
): Promise<{ meta: CacheEntryMetaType; output: string } | null> => {
  const metaFile = Bun.file(join(cacheDir, hash, "meta.json"));
  if (!(await metaFile.exists())) return null;

  try {
    const meta: CacheEntryMetaType = await metaFile.json();
    const outputFile = Bun.file(join(cacheDir, hash, "output.log"));
    const output = (await outputFile.exists()) ? await outputFile.text() : "";
    return { meta, output };
  } catch {
    return null;
  }
};

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

/** Copy the cached output artifacts of an entry back into the target directory. */
export const restoreCacheOutputs = async (
  cacheDir: string,
  meta: CacheEntryMetaType,
  targetDir: string,
): Promise<void> => {
  for (const output of meta.outputs) {
    const source = join(cacheDir, meta.hash, "outputs", output);
    if (!(await pathExists(source))) continue;
    await rm(join(targetDir, output), { recursive: true, force: true });
    await cp(source, join(targetDir, output), { recursive: true });
  }
};

/**
 * Persist a successful task run: metadata, replayable output and the output
 * artifacts that exist. The entry is assembled in a temp directory and renamed
 * into place so a crashed run never leaves a half-written entry behind.
 */
export const writeCacheEntry = async (
  cacheDir: string,
  meta: CacheEntryMetaType,
  output: string,
  targetDir: string,
): Promise<void> => {
  const tempDir = join(cacheDir, `.tmp-${meta.hash}`);
  const entryDir = join(cacheDir, meta.hash);

  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });

  const capturedOutputs: string[] = [];
  for (const out of meta.outputs) {
    const source = join(targetDir, out);
    if (!(await pathExists(source))) continue;
    await cp(source, join(tempDir, "outputs", out), { recursive: true });
    capturedOutputs.push(out);
  }

  await Bun.write(join(tempDir, "meta.json"), JSON.stringify({ ...meta, outputs: capturedOutputs }, null, 2));
  await Bun.write(join(tempDir, "output.log"), output);

  await rm(entryDir, { recursive: true, force: true });
  await rename(tempDir, entryDir);
};
