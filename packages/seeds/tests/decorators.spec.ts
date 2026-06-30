import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { container, EContainerScope } from "@talosjs/container";
import { SEEDS_CONTAINER } from "@/container";
import { decorator } from "@/decorators";
import type { ISeed } from "@/types";

describe("seed decorator", () => {
  let originalAdd: typeof container.add;

  beforeEach(() => {
    originalAdd = container.add;
    container.add = mock(() => {});
    SEEDS_CONTAINER.length = 0;
  });

  afterEach(() => {
    container.add = originalAdd;
    SEEDS_CONTAINER.length = 0;
  });

  test("should register Seed class in container and SEEDS_CONTAINER (default scope Singleton)", () => {
    @decorator.seed()
    class UserSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [];
      }
      getEnv() {
        return [];
      }
    }

    expect(container.add).toHaveBeenCalledTimes(1);
    expect(container.add).toHaveBeenCalledWith(UserSeed, EContainerScope.Singleton);
    expect(SEEDS_CONTAINER).toHaveLength(1);
    expect(SEEDS_CONTAINER[0]).toBe(UserSeed);
  });

  test("should accept custom scope parameter", () => {
    @decorator.seed(EContainerScope.Transient)
    class AnotherSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [];
      }
      getEnv() {
        return [];
      }
    }

    expect(container.add).toHaveBeenCalledWith(AnotherSeed, EContainerScope.Transient);
  });
});
