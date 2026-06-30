import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { IFeatureFlag } from "@/types";

class NewCheckoutFeatureFlag implements IFeatureFlag {
  public getKey(): string {
    return "new-checkout";
  }
  public getDescription(): string {
    return "Enables the redesigned checkout flow";
  }
  public isEnabled(): boolean {
    return true;
  }
}

describe("decorator.featureFlag", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register a feature flag class without throwing", () => {
    expect(() => {
      decorator.featureFlag()(NewCheckoutFeatureFlag);
    }).not.toThrow();
  });

  test("should register with default singleton scope", () => {
    decorator.featureFlag()(NewCheckoutFeatureFlag);

    const instance1 = container.get(NewCheckoutFeatureFlag);
    const instance2 = container.get(NewCheckoutFeatureFlag);

    expect(instance1).toBe(instance2);
    expect(instance1.getKey()).toBe("new-checkout");
  });

  test("should register with transient scope", () => {
    class TransientFeatureFlag implements IFeatureFlag {
      public getKey(): string {
        return "transient";
      }
      public getDescription(): string {
        return "Transient scoped flag";
      }
      public isEnabled(): boolean {
        return false;
      }
    }

    decorator.featureFlag(EContainerScope.Transient)(TransientFeatureFlag);

    const instance1 = container.get(TransientFeatureFlag);
    const instance2 = container.get(TransientFeatureFlag);

    expect(instance1).not.toBe(instance2);
  });

  test("should return void", () => {
    expect(decorator.featureFlag()(NewCheckoutFeatureFlag)).toBeUndefined();
  });
});
