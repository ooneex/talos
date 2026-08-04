import { describe, expect, it } from "bun:test";
import {
  createDirectory,
  createFile,
  resetFactoriesForTesting,
  setDirectoryFactory,
  setFileFactory,
} from "../src/crossFactories";

describe("crossFactories", () => {
  describe("setDirectoryFactory / createDirectory", () => {
    it("builds an instance through the registered factory", () => {
      const built: string[] = [];
      const factory = (path: string) => {
        built.push(path);
        return { getPath: () => path } as unknown as ReturnType<typeof createDirectory>;
      };
      setDirectoryFactory(factory);

      const directory = createDirectory("/tmp/example");

      expect(built).toEqual(["/tmp/example"]);
      expect(directory.getPath()).toBe("/tmp/example");
    });

    it("throws when no factory has been registered", () => {
      resetFactoriesForTesting();

      expect(() => createDirectory("/tmp/example")).toThrow(/Directory factory is not registered/);

      // Restore so other tests relying on Directory/File construction keep working.
      setDirectoryFactory((path) => ({ getPath: () => path }) as unknown as ReturnType<typeof createDirectory>);
    });
  });

  describe("setFileFactory / createFile", () => {
    it("builds an instance through the registered factory", () => {
      const built: string[] = [];
      const factory = (path: string) => {
        built.push(path);
        return { getPath: () => path } as unknown as ReturnType<typeof createFile>;
      };
      setFileFactory(factory);

      const file = createFile("/tmp/example.txt");

      expect(built).toEqual(["/tmp/example.txt"]);
      expect(file.getPath()).toBe("/tmp/example.txt");
    });

    it("throws when no factory has been registered", () => {
      resetFactoriesForTesting();

      expect(() => createFile("/tmp/example.txt")).toThrow(/File factory is not registered/);

      // Restore so other tests relying on Directory/File construction keep working.
      setFileFactory((path) => ({ getPath: () => path }) as unknown as ReturnType<typeof createFile>);
    });
  });
});
