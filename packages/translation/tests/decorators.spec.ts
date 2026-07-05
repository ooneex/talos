import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { ITranslation, TranslationDictType, TransOptionsType } from "@/types";

class StubTranslation implements ITranslation {
  public getName = (): string => "stub";
  public getDict = (): TranslationDictType => ({});
  public has = (_key: string): boolean => false;
  public trans = (key: string, _options?: TransOptionsType): string => key;
}

describe("decorator.translation", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register a translation class with the default singleton scope", () => {
    class DefaultTranslation extends StubTranslation {}

    decorator.translation()(DefaultTranslation);

    const instance1 = container.get(DefaultTranslation);
    const instance2 = container.get(DefaultTranslation);

    expect(instance1).toBeInstanceOf(DefaultTranslation);
    expect(instance1).toBe(instance2);
  });

  test("should register a translation class with an explicit singleton scope", () => {
    class SingletonTranslation extends StubTranslation {}

    decorator.translation(EContainerScope.Singleton)(SingletonTranslation);

    const instance1 = container.get(SingletonTranslation);
    const instance2 = container.get(SingletonTranslation);

    expect(instance1).toBe(instance2);
  });

  test("should register a translation class with a transient scope", () => {
    class TransientTranslation extends StubTranslation {}

    decorator.translation(EContainerScope.Transient)(TransientTranslation);

    const instance1 = container.get(TransientTranslation);
    const instance2 = container.get(TransientTranslation);

    expect(instance1).not.toBe(instance2);
  });

  test("should allow retrieving the registered translation from the container", () => {
    class RetrievableTranslation extends StubTranslation {
      public override trans = (key: string): string => `t:${key}`;
    }

    decorator.translation()(RetrievableTranslation);

    const instance = container.get(RetrievableTranslation);
    expect(instance).toBeInstanceOf(RetrievableTranslation);
    expect(instance.trans("home")).toBe("t:home");
  });

  test("should return void", () => {
    class VoidTranslation extends StubTranslation {}

    expect(decorator.translation()(VoidTranslation)).toBeUndefined();
  });
});
