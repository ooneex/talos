import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { Directory, DirectoryException, File } from "@/index";

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

const TEST_DIR = ".temp/talos-fs-test";
const SUB_DIR = `${TEST_DIR}/subdir`;
const NESTED_DIR = `${TEST_DIR}/level1/level2/level3`;

describe("Directory", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
    await mkdir(SUB_DIR, { recursive: true });
    await Bun.write(`${TEST_DIR}/file1.txt`, "content1");
    await Bun.write(`${TEST_DIR}/file2.txt`, "content2");
    await Bun.write(`${SUB_DIR}/nested.txt`, "nested content");
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("constructor", () => {
    test("should create a Directory instance", () => {
      const dir = new Directory(TEST_DIR);
      expect(dir).toBeInstanceOf(Directory);
    });
  });

  describe("getPath", () => {
    test("should return the directory path", () => {
      const dir = new Directory(TEST_DIR);
      expect(dir.getPath()).toBe(TEST_DIR);
    });
  });

  describe("getName", () => {
    test("should return the directory name", () => {
      const dir = new Directory(TEST_DIR);
      expect(dir.getName()).toBe("talos-fs-test");
    });

    test("should return name for nested directory", () => {
      const dir = new Directory(SUB_DIR);
      expect(dir.getName()).toBe("subdir");
    });
  });

  describe("getParent", () => {
    test("should return the parent directory path", () => {
      const dir = new Directory(SUB_DIR);
      expect(dir.getParent()).toBe(TEST_DIR);
    });

    test("should return parent for root test directory", () => {
      const dir = new Directory(TEST_DIR);
      expect(dir.getParent()).toBe(".temp");
    });
  });

  describe("exists", () => {
    test("should return true for existing directory", async () => {
      const dir = new Directory(TEST_DIR);
      expect(await dir.exists()).toBe(true);
    });

    test("should return false for non-existent directory", async () => {
      const dir = new Directory(`${TEST_DIR}/nonexistent`);
      expect(await dir.exists()).toBe(false);
    });

    test("should return false for file path", async () => {
      const dir = new Directory(`${TEST_DIR}/file1.txt`);
      expect(await dir.exists()).toBe(false);
    });
  });

  describe("mkdir", () => {
    test("should create a new directory", async () => {
      const newDir = `${TEST_DIR}/newdir`;
      const dir = new Directory(newDir);
      await dir.mkdir();
      expect(await dir.exists()).toBe(true);
    });

    test("should create nested directories with recursive option", async () => {
      const dir = new Directory(NESTED_DIR);
      await dir.mkdir({ recursive: true });
      expect(await dir.exists()).toBe(true);
    });

    test("should not throw if directory already exists with recursive", async () => {
      const dir = new Directory(TEST_DIR);
      await dir.mkdir({ recursive: true });
      expect(await dir.exists()).toBe(true);
    });
  });

  describe("rm", () => {
    test("should delete an empty directory", async () => {
      const emptyDir = `${TEST_DIR}/empty`;
      const dir = new Directory(emptyDir);
      await dir.mkdir();
      expect(await dir.exists()).toBe(true);

      await dir.rm();
      expect(await dir.exists()).toBe(false);
    });

    test("should delete directory with contents recursively", async () => {
      const dir = new Directory(SUB_DIR);
      expect(await dir.exists()).toBe(true);

      await dir.rm({ recursive: true });
      expect(await dir.exists()).toBe(false);
    });

    test("should not throw with force option for non-existent directory", async () => {
      const dir = new Directory(`${TEST_DIR}/nonexistent`);
      await dir.rm({ force: true });
      expect(await dir.exists()).toBe(false);
    });
  });

  describe("ls", () => {
    test("should list directory contents", async () => {
      const dir = new Directory(TEST_DIR);
      const contents = await dir.ls();
      expect(contents).toContain("file1.txt");
      expect(contents).toContain("file2.txt");
      expect(contents).toContain("subdir");
    });

    test("should list contents recursively", async () => {
      const dir = new Directory(TEST_DIR);
      const contents = await dir.ls({ recursive: true });
      expect(contents.length).toBeGreaterThan(3);
    });

    test("should throw for non-existent directory", async () => {
      const dir = new Directory(`${TEST_DIR}/nonexistent`);
      expect(dir.ls()).rejects.toThrow(DirectoryException);
    });
  });

  describe("lsWithTypes", () => {
    test("should list directory contents with type information", async () => {
      const dir = new Directory(TEST_DIR);
      const entries = await dir.lsWithTypes();

      const fileEntry = entries.find((e) => e.name === "file1.txt");
      const dirEntry = entries.find((e) => e.name === "subdir");

      expect(fileEntry?.isFile()).toBe(true);
      expect(dirEntry?.isDirectory()).toBe(true);
    });

    test("should list contents recursively with types", async () => {
      const dir = new Directory(TEST_DIR);
      const entries = await dir.lsWithTypes({ recursive: true });
      expect(entries.length).toBeGreaterThan(3);
    });
  });

  describe("cp", () => {
    test("should copy directory to destination", async () => {
      const sourceDir = new Directory(SUB_DIR);
      const destPath = `${TEST_DIR}/copied`;

      await sourceDir.cp(destPath);

      const destDir = new Directory(destPath);
      expect(await destDir.exists()).toBe(true);

      const contents = await destDir.ls();
      expect(contents).toContain("nested.txt");
    });

    test("should copy directory recursively", async () => {
      const sourceDir = new Directory(TEST_DIR);
      const destPath = ".temp/talos-fs-test-copy";

      await sourceDir.cp(destPath, { recursive: true });

      const destDir = new Directory(destPath);
      expect(await destDir.exists()).toBe(true);

      const contents = await destDir.ls();
      expect(contents).toContain("subdir");

      await destDir.rm({ recursive: true });
    });
  });

  describe("mv", () => {
    test("should move directory to new location", async () => {
      const moveDir = `${TEST_DIR}/tomove`;
      const destPath = `${TEST_DIR}/moved`;

      const { mkdir } = await import("node:fs/promises");
      await mkdir(moveDir);
      await Bun.write(`${moveDir}/file.txt`, "content");

      const dir = new Directory(moveDir);
      await dir.mv(destPath);

      expect(await dir.exists()).toBe(false);

      const movedDir = new Directory(destPath);
      expect(await movedDir.exists()).toBe(true);
    });
  });

  describe("stat", () => {
    test("should return directory stats", async () => {
      const dir = new Directory(TEST_DIR);
      const stats = await dir.stat();

      expect(stats.isDirectory()).toBe(true);
      expect(stats.isFile()).toBe(false);
      expect(stats.mode).toBeDefined();
      expect(stats.mtime).toBeInstanceOf(Date);
    });

    test("should throw for non-existent directory", async () => {
      const dir = new Directory(`${TEST_DIR}/nonexistent`);
      expect(dir.stat()).rejects.toThrow(DirectoryException);
    });
  });

  describe("watch", () => {
    test("should return a watcher instance", () => {
      const dir = new Directory(TEST_DIR);
      const watcher = dir.watch(() => {});

      expect(watcher).toBeDefined();
      expect(typeof watcher.close).toBe("function");

      watcher.close();
    });

    test("should accept recursive option", () => {
      const dir = new Directory(TEST_DIR);
      const watcher = dir.watch(() => {}, { recursive: true });

      expect(watcher).toBeDefined();
      watcher.close();
    });
  });

  describe("isEmpty", () => {
    test("should return false for non-empty directory", async () => {
      const dir = new Directory(TEST_DIR);
      expect(await dir.isEmpty()).toBe(false);
    });

    test("should return true for empty directory", async () => {
      const emptyDir = `${TEST_DIR}/empty`;
      const dir = new Directory(emptyDir);
      await dir.mkdir();

      expect(await dir.isEmpty()).toBe(true);
    });

    test("should throw for non-existent directory", async () => {
      const dir = new Directory(`${TEST_DIR}/nonexistent`);
      expect(dir.isEmpty()).rejects.toThrow(DirectoryException);
    });
  });

  describe("getSize", () => {
    test("should return total size of directory contents", async () => {
      const dir = new Directory(TEST_DIR);
      const size = await dir.getSize();

      expect(size).toBeGreaterThan(0);
    });

    test("should return 0 for empty directory", async () => {
      const emptyDir = `${TEST_DIR}/empty`;
      const dir = new Directory(emptyDir);
      await dir.mkdir();

      const size = await dir.getSize();
      expect(size).toBe(0);
    });

    test("should include nested directory sizes", async () => {
      const dir = new Directory(TEST_DIR);
      const totalSize = await dir.getSize();

      const subDir = new Directory(SUB_DIR);
      const subSize = await subDir.getSize();

      expect(totalSize).toBeGreaterThan(subSize);
    });
  });

  describe("getFiles", () => {
    test("should return only files, not directories", async () => {
      const dir = new Directory(TEST_DIR);
      const files = await collect(dir.getFiles());

      expect(files.every((f) => f instanceof File)).toBe(true);
      const names = files.map((f) => f.getName());
      expect(names).toContain("file1.txt");
      expect(names).toContain("file2.txt");
      expect(names).not.toContain("subdir");
    });

    test("should return files recursively when option is set", async () => {
      const dir = new Directory(TEST_DIR);
      const files = await collect(dir.getFiles({ recursive: true }));

      expect(files.every((f) => f instanceof File)).toBe(true);
      const names = files.map((f) => f.getName());
      expect(names).toContain("file1.txt");
      expect(names).toContain("file2.txt");
      expect(names).toContain("nested.txt");
    });

    test("should filter files by pattern", async () => {
      await Bun.write(`${TEST_DIR}/script.ts`, "typescript");
      await Bun.write(`${TEST_DIR}/style.css`, "css");

      const dir = new Directory(TEST_DIR);
      const txtFiles = await collect(dir.getFiles({ pattern: /\.txt$/ }));

      const names = txtFiles.map((f) => f.getName());
      expect(names).toContain("file1.txt");
      expect(names).toContain("file2.txt");
      expect(names).not.toContain("script.ts");
      expect(names).not.toContain("style.css");
    });

    test("should filter files recursively by pattern", async () => {
      await Bun.write(`${SUB_DIR}/code.ts`, "typescript");

      const dir = new Directory(TEST_DIR);
      const tsFiles = await collect(dir.getFiles({ recursive: true, pattern: /\.ts$/ }));

      expect(tsFiles.length).toBe(1);
      expect(tsFiles[0]?.getName()).toBe("code.ts");
    });

    test("should return empty array for empty directory", async () => {
      const emptyDir = `${TEST_DIR}/empty`;
      const dir = new Directory(emptyDir);
      await dir.mkdir();

      const files = await collect(dir.getFiles());
      expect(files).toEqual([]);
    });

    test("should throw for non-existent directory", async () => {
      const dir = new Directory(`${TEST_DIR}/nonexistent`);
      expect(collect(dir.getFiles())).rejects.toThrow(DirectoryException);
    });

    test("should return empty array when pattern matches nothing", async () => {
      const dir = new Directory(TEST_DIR);
      const files = await collect(dir.getFiles({ pattern: /\.xyz$/ }));

      expect(files).toEqual([]);
    });

    test("should return files with correct absolute paths", async () => {
      const dir = new Directory(TEST_DIR);
      const files = await collect(dir.getFiles());

      for (const file of files) {
        expect(file.getPath().startsWith(TEST_DIR)).toBe(true);
        expect(await file.exists()).toBe(true);
      }
    });
  });

  describe("getDirectories", () => {
    test("should return only directories, not files", async () => {
      const dir = new Directory(TEST_DIR);
      const dirs = await collect(dir.getDirectories());

      expect(dirs.every((d) => d instanceof Directory)).toBe(true);
      const names = dirs.map((d) => d.getName());
      expect(names).toContain("subdir");
      expect(names).not.toContain("file1.txt");
      expect(names).not.toContain("file2.txt");
    });

    test("should return directories recursively when option is set", async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(`${SUB_DIR}/deeper`, { recursive: true });

      const dir = new Directory(TEST_DIR);
      const dirs = await collect(dir.getDirectories({ recursive: true }));

      expect(dirs.every((d) => d instanceof Directory)).toBe(true);
      const names = dirs.map((d) => d.getName());
      expect(names).toContain("subdir");
      expect(names).toContain("deeper");
    });

    test("should filter directories by pattern", async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(`${TEST_DIR}/test-dir`, { recursive: true });
      await mkdir(`${TEST_DIR}/other-dir`, { recursive: true });

      const dir = new Directory(TEST_DIR);
      const testDirs = await collect(dir.getDirectories({ pattern: /^test/ }));

      const names = testDirs.map((d) => d.getName());
      expect(names).toContain("test-dir");
      expect(names).not.toContain("other-dir");
      expect(names).not.toContain("subdir");
    });

    test("should filter directories recursively by pattern", async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(`${SUB_DIR}/test-nested`, { recursive: true });
      await mkdir(`${SUB_DIR}/other-nested`, { recursive: true });

      const dir = new Directory(TEST_DIR);
      const testDirs = await collect(dir.getDirectories({ recursive: true, pattern: /test-nested$/ }));

      expect(testDirs.length).toBe(1);
      expect(testDirs[0]?.getName()).toBe("test-nested");
    });

    test("should return empty array for directory with no subdirectories", async () => {
      const dir = new Directory(SUB_DIR);
      const dirs = await collect(dir.getDirectories());

      expect(dirs).toEqual([]);
    });

    test("should throw for non-existent directory", async () => {
      const dir = new Directory(`${TEST_DIR}/nonexistent`);
      expect(collect(dir.getDirectories())).rejects.toThrow(DirectoryException);
    });

    test("should return empty array when pattern matches nothing", async () => {
      const dir = new Directory(TEST_DIR);
      const dirs = await collect(dir.getDirectories({ pattern: /^xyz/ }));

      expect(dirs).toEqual([]);
    });

    test("should return directories with correct absolute paths", async () => {
      const dir = new Directory(TEST_DIR);
      const dirs = await collect(dir.getDirectories());

      for (const subdir of dirs) {
        expect(subdir.getPath().startsWith(TEST_DIR)).toBe(true);
        expect(await subdir.exists()).toBe(true);
      }
    });
  });

  describe("cd", () => {
    test("should return a new Directory instance for subdirectory", () => {
      const dir = new Directory(TEST_DIR);
      const subdir = dir.cd("subdir");

      expect(subdir).toBeInstanceOf(Directory);
      expect(subdir.getPath()).toBe(`${TEST_DIR}/subdir`);
    });

    test("should navigate to nested subdirectory with single path", () => {
      const dir = new Directory(TEST_DIR);
      const nested = dir.cd("subdir/nested");

      expect(nested.getPath()).toBe(`${TEST_DIR}/subdir/nested`);
    });

    test("should navigate to nested subdirectory with multiple args", () => {
      const dir = new Directory(TEST_DIR);
      const nested = dir.cd("level1", "level2", "level3");

      expect(nested.getPath()).toBe(`${TEST_DIR}/level1/level2/level3`);
    });

    test("should navigate to parent directory", () => {
      const dir = new Directory(SUB_DIR);
      const parent = dir.cd("..");

      expect(parent.getPath()).toBe(TEST_DIR);
    });

    test("should support chained navigation", () => {
      const dir = new Directory(TEST_DIR);
      const deep = dir.cd("level1").cd("level2").cd("level3");

      expect(deep.getPath()).toBe(`${TEST_DIR}/level1/level2/level3`);
    });

    test("should work with existing subdirectory", async () => {
      const dir = new Directory(TEST_DIR);
      const subdir = dir.cd("subdir");

      expect(await subdir.exists()).toBe(true);
    });

    test("should work with non-existent path (lazy evaluation)", async () => {
      const dir = new Directory(TEST_DIR);
      const nonexistent = dir.cd("does-not-exist");

      expect(nonexistent.getPath()).toBe(`${TEST_DIR}/does-not-exist`);
      expect(await nonexistent.exists()).toBe(false);
    });

    test("should handle mixed args with parent navigation", () => {
      const dir = new Directory(TEST_DIR);
      const result = dir.cd("level1", "level2", "..", "other");

      expect(result.getPath()).toBe(`${TEST_DIR}/level1/other`);
    });
  });
});

describe("DirectoryException", () => {
  test("should have correct name", () => {
    const exception = new DirectoryException("Test error", "test_error");
    expect(exception.name).toBe("DirectoryException");
  });

  test("should have correct message", () => {
    const exception = new DirectoryException("Test error message", "test_error_message");
    expect(exception.message).toBe("Test error message");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new DirectoryException("Test", "test_key", data);
    expect(Object.isFrozen(exception.data)).toBe(true);
  });

  test("should have default status 500", () => {
    const exception = new DirectoryException("Test", "test_key");
    expect(exception.status).toBe(500);
  });
});
