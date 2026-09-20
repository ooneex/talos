import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Container, container, inject, injectable } from "@/index";

// Loading the sources from a second path gives Bun a module graph of its own, which is what a dependency
// tree does when two semver ranges pull two copies of the package. The copy stays inside the package so
// `@talosjs/exception` still resolves from its `node_modules`.
const directory = join(import.meta.dir, "tmp", "registry-copy");

rmSync(directory, { recursive: true, force: true });
mkdirSync(directory, { recursive: true });
cpSync(join(import.meta.dir, "..", "src"), directory, { recursive: true });

const copy = (await import(join(directory, "index.ts"))) as typeof import("@/index");

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("registry - duplicate copies of the package", () => {
  test("should load the copy as a separate module graph", () => {
    expect(copy.Container).not.toBe(Container);
    expect(copy.container).not.toBe(container);
  });

  test("should resolve through one copy a class the other one registered", () => {
    class SharedRepository {}

    class SharedService {
      public constructor(public readonly repository: SharedRepository) {}
    }

    container.add(SharedRepository);
    inject(SharedRepository)(SharedService, undefined, 0);
    container.add(SharedService);

    const service = copy.container.get(SharedService);

    expect(service).toBeInstanceOf(SharedService);
    expect(service.repository).toBeInstanceOf(SharedRepository);
  });

  test("should read the injections one copy recorded from the other one", () => {
    class CrossRepository {}

    class CrossService {
      public constructor(public readonly repository: CrossRepository) {}
    }

    copy.inject(CrossRepository)(CrossService, undefined, 0);
    copy.container.add(CrossRepository);
    container.add(CrossService);

    expect(container.get(CrossService).repository).toBeInstanceOf(CrossRepository);
  });

  test("should hand both copies the same singleton instance", () => {
    @injectable()
    class SingletonAcrossCopies {}

    expect(copy.container.has(SingletonAcrossCopies)).toBe(true);
    expect(copy.container.get(SingletonAcrossCopies)).toBe(container.get(SingletonAcrossCopies));
  });

  test("should share constants and removals between copies", () => {
    copy.container.addConstant("cross-copy-token", 42);

    expect(container.hasConstant("cross-copy-token")).toBe(true);
    expect(container.getConstant<number>("cross-copy-token")).toBe(42);

    container.removeConstant("cross-copy-token");

    expect(copy.container.hasConstant("cross-copy-token")).toBe(false);
  });

  test("should detect a cycle that runs through the other copy", () => {
    class LeftService {
      public constructor(public readonly right: unknown) {}
    }

    class RightService {
      public constructor(public readonly left: unknown) {}
    }

    inject(RightService)(LeftService, undefined, 0);
    copy.inject(LeftService)(RightService, undefined, 0);
    container.add(LeftService);
    copy.container.add(RightService);

    expect(() => copy.container.get(LeftService)).toThrow(/Circular dependency found/);
  });
});
