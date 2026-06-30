import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { IMailer } from "@/types";

describe("decorator.mailer", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register class ending with 'Mailer' successfully", () => {
    class TestMailer implements IMailer {
      public async send(): Promise<void> {
        // noop
      }
    }

    expect(() => {
      decorator.mailer()(TestMailer);
    }).not.toThrow();
  });

  test("should register class with default singleton scope", () => {
    class SingletonMailer implements IMailer {
      public async send(): Promise<void> {
        // noop
      }
    }

    decorator.mailer()(SingletonMailer);

    const instance1 = container.get(SingletonMailer);
    const instance2 = container.get(SingletonMailer);

    expect(instance1).toBe(instance2);
  });

  test("should register class with explicit singleton scope", () => {
    class ExplicitSingletonMailer implements IMailer {
      public async send(): Promise<void> {
        // noop
      }
    }

    decorator.mailer(EContainerScope.Singleton)(ExplicitSingletonMailer);

    const instance1 = container.get(ExplicitSingletonMailer);
    const instance2 = container.get(ExplicitSingletonMailer);

    expect(instance1).toBe(instance2);
  });

  test("should register class with transient scope", () => {
    class TransientMailer implements IMailer {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientMailer.instanceCount++;
        this.instanceId = TransientMailer.instanceCount;
      }

      public async send(): Promise<void> {
        // noop
      }
    }

    decorator.mailer(EContainerScope.Transient)(TransientMailer);

    const instance1 = container.get(TransientMailer);
    const instance2 = container.get(TransientMailer);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register class with request scope", () => {
    class RequestScopedMailer implements IMailer {
      public async send(): Promise<void> {
        // noop
      }
    }

    expect(() => {
      decorator.mailer(EContainerScope.Request)(RequestScopedMailer);
    }).not.toThrow();

    const instance = container.get(RequestScopedMailer);
    expect(instance).toBeInstanceOf(RequestScopedMailer);
  });

  test("should register class with complex name ending in 'Mailer'", () => {
    class ResendTransactionalMailer implements IMailer {
      public async send(): Promise<void> {
        // noop
      }
    }

    expect(() => {
      decorator.mailer()(ResendTransactionalMailer);
    }).not.toThrow();
  });

  test("should allow retrieving registered Mailer class from container", () => {
    class RetrievableMailer implements IMailer {
      public readonly name = "retrievable";

      public async send(): Promise<void> {
        // noop
      }
    }

    decorator.mailer()(RetrievableMailer);

    const instance = container.get(RetrievableMailer);
    expect(instance).toBeInstanceOf(RetrievableMailer);
    expect(instance.name).toBe("retrievable");
  });

  test("should work with Mailer class that has full send config", () => {
    class FullConfigMailer implements IMailer {
      public async send(_config: {
        to: string[];
        subject: string;
        content: React.ReactNode;
        from?: { name: string; address: string };
      }): Promise<void> {
        // noop
      }
    }

    expect(() => {
      decorator.mailer()(FullConfigMailer);
    }).not.toThrow();

    const instance = container.get(FullConfigMailer);
    expect(instance).toBeInstanceOf(FullConfigMailer);
  });

  test("should return void from the decorator function", () => {
    class VoidReturnMailer implements IMailer {
      public async send(): Promise<void> {
        // noop
      }
    }

    const result = decorator.mailer()(VoidReturnMailer);
    expect(result).toBeUndefined();
  });
});
