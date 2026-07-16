import { describe, expect, test } from "bun:test";
import { type RunnableModule, selectRunnableModules } from "@/runnableModules";

const module = (name: string): RunnableModule => ({ name, type: "api", dir: `/modules/${name}` });

describe("selectRunnableModules", () => {
  const modules = [module("app"), module("order"), module("billing")];

  test("should return every module when no options are given", () => {
    expect(selectRunnableModules(modules)).toEqual(modules);
  });

  test("should return every module when neither --modules nor --packages names anything", () => {
    expect(selectRunnableModules(modules, {})).toEqual(modules);
    expect(selectRunnableModules(modules, { modules: true, packages: true })).toEqual(modules);
    expect(selectRunnableModules(modules, { modules: "", packages: "  ,  " })).toEqual(modules);
  });

  test("should keep only the modules named with --modules", () => {
    expect(selectRunnableModules(modules, { modules: "order,billing" })).toEqual([module("order"), module("billing")]);
  });

  test("should treat --packages as an alias and union both flags, ignoring whitespace", () => {
    expect(selectRunnableModules(modules, { modules: " order ", packages: "app" })).toEqual([
      module("app"),
      module("order"),
    ]);
  });

  test("should return no modules when the requested names do not match", () => {
    expect(selectRunnableModules(modules, { modules: "unknown" })).toEqual([]);
  });
});
