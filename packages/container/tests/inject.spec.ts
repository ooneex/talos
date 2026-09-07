import { describe, expect, test } from "bun:test";
import { ContainerException } from "@/index";
import { getInjections, inject } from "@/inject";

describe("inject", () => {
  test("should record the token of each decorated constructor parameter by index", () => {
    class Env {}
    const TOKEN = Symbol("token");

    class Service {
      constructor(
        @inject(Env) public readonly env: Env,
        public readonly options: Record<string, unknown> = {},
        @inject("database") public readonly database?: unknown,
        @inject(TOKEN) public readonly token?: unknown,
      ) {}
    }

    const tokens = getInjections(Service);

    expect(tokens.length).toBe(4);
    expect(tokens[0]).toBe(Env);
    expect(tokens[1]).toBeUndefined();
    expect(tokens[2]).toBe("database");
    expect(tokens[3]).toBe(TOKEN);
  });

  test("should return a shared frozen empty list for a class without decorated parameters", () => {
    class Plain {
      constructor(public readonly value: string = "plain") {}
    }

    class Other {}

    expect(getInjections(Plain).length).toBe(0);
    expect(Object.isFrozen(getInjections(Plain))).toBe(true);
    expect(getInjections(Plain)).toBe(getInjections(Other));
  });

  test("should keep a subclass separate from the injections of its parent", () => {
    class Env {}
    class Logger {}

    class Base {
      constructor(@inject(Env) public readonly env: Env) {}
    }

    class Child extends Base {
      constructor(
        @inject(Env) env: Env,
        @inject(Logger) public readonly logger: Logger,
      ) {
        super(env);
      }
    }

    class Untouched extends Base {}

    expect(getInjections(Base).length).toBe(1);
    expect(getInjections(Child).length).toBe(2);
    expect(getInjections(Child)[1]).toBe(Logger);
    expect(getInjections(Untouched).length).toBe(0);
  });

  test("should throw when applied to a method parameter", () => {
    class Env {}

    class Service {
      public run(_env: Env): void {}
    }

    expect(() => inject(Env)(Service.prototype, "run", 0)).toThrow(ContainerException);

    try {
      inject(Env)(Service.prototype, "run", 0);
    } catch (error) {
      const exception = error as ContainerException;
      expect(exception.key).toBe("INVALID_INJECT_TARGET");
      expect(exception.message).toBe('@inject only decorates constructor parameters. Found it on "run" of "Service"');
      expect(exception.data).toEqual({ owner: "Service", propertyKey: "run", parameterIndex: 0 });
    }
  });

  test("should throw when applied to a static method parameter", () => {
    class Env {}

    class Service {
      public readonly created = true;

      public static create(_env: Env): Service {
        return new Service();
      }
    }

    expect(() => inject(Env)(Service, "create", 0)).toThrow(
      '@inject only decorates constructor parameters. Found it on "create" of "Service"',
    );
    expect(getInjections(Service).length).toBe(0);
  });
});
