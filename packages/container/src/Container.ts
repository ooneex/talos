import { ContainerException } from "./ContainerException";
import { getInjections } from "./inject";
import { type ClassType, EContainerScope, type IContainer, type ServiceIdentifierType } from "./types";

/** Placeholder held by a singleton binding until its instance is built; avoids boxing the instance. */
const UNRESOLVED: unique symbol = Symbol("unresolved");

/** One entry per constructor parameter: the token to resolve, or `undefined` to let the default value apply. */
type ArgumentsPlanType = readonly (ServiceIdentifierType | undefined)[];

type InstanceBindingType = {
  kind: "instance";
  target: ClassType;
  scope: EContainerScope;
  /** Validated on the first instantiation, then reused by every later one. */
  plan: ArgumentsPlanType | undefined;
  /** The singleton instance, `UNRESOLVED` until built; unused by the other scopes. */
  instance: unknown;
};

type ConstantBindingType = {
  kind: "constant";
  value: unknown;
};

type BindingType = InstanceBindingType | ConstantBindingType;

// Shared across every Container instance so decorators, packages and the application register into one graph.
const bindings = new Map<ServiceIdentifierType, BindingType>();

// Resolution is synchronous, so a single chain of the classes under construction (innermost last) serves every
// `get()`, including one issued from inside a constructor: no context object is allocated per call, and a cycle
// that goes through such a nested call is caught instead of overflowing the stack.
const chain: ClassType[] = [];

// Request-scoped instances of the `get()` in progress, created on the first request-scoped binding met.
let request: Map<InstanceBindingType, unknown> | undefined;

const stringify = (identifier: ServiceIdentifierType): string =>
  typeof identifier === "function" ? identifier.name : identifier.toString();

const missingBinding = (identifier: ServiceIdentifierType): ContainerException => {
  const service = stringify(identifier);
  const parent = chain.at(-1)?.name ?? null;

  return new ContainerException(
    `No bindings found for service: "${service}"${parent ? ` (injected into "${parent}")` : ""}`,
    "BINDING_NOT_FOUND",
    { service, parent },
  );
};

const circularDependency = (cycleStart: number, target: ClassType): ContainerException => {
  const trace = [...chain.slice(cycleStart), target].map(stringify);

  return new ContainerException(`Circular dependency found: ${trace.join(" -> ")}`, "CIRCULAR_DEPENDENCY", { trace });
};

/** Checks the constructor once: every required parameter must carry a token, defaulted ones may not. */
const planArguments = (target: ClassType): ArgumentsPlanType => {
  const tokens = getInjections(target);
  // `target.length` stops at the first parameter with a default value, yet a decorated one may sit past it.
  const length = Math.max(target.length, tokens.length);
  const plan: (ServiceIdentifierType | undefined)[] = [];

  for (let index = 0; index < length; index++) {
    const token = tokens[index];

    if (token === undefined && index < target.length) {
      throw new ContainerException(
        `Missing @inject on constructor parameter ${index} of "${target.name}": every required constructor parameter must be decorated`,
        "MISSING_INJECTION",
        { service: target.name, parameterIndex: index },
      );
    }

    plan.push(token);
  }

  return plan;
};

/** Resolves one planned parameter; `undefined` lets the constructor apply its default value. */
const argument = (token: ServiceIdentifierType | undefined): unknown =>
  token === undefined ? undefined : resolve(token);

const construct = (target: ClassType, plan: ArgumentsPlanType): unknown => {
  // A direct `new` costs a quarter of a spread call, so the common arities get one; wider constructors spread.
  switch (plan.length) {
    case 1:
      return new target(argument(plan[0]));
    case 2:
      return new target(argument(plan[0]), argument(plan[1]));
    case 3:
      return new target(argument(plan[0]), argument(plan[1]), argument(plan[2]));
    case 4:
      return new target(argument(plan[0]), argument(plan[1]), argument(plan[2]), argument(plan[3]));
    default:
      return new target(...plan.map(argument));
  }
};

const instantiate = (binding: InstanceBindingType): unknown => {
  const { target } = binding;
  binding.plan ??= planArguments(target);
  const { plan } = binding;

  // Nothing to resolve, so nothing can loop back here: skip the chain bookkeeping entirely.
  if (plan.length === 0) {
    return new target();
  }

  const cycleStart = chain.indexOf(target);

  if (cycleStart !== -1) {
    throw circularDependency(cycleStart, target);
  }

  chain.push(target);

  try {
    return construct(target, plan);
  } finally {
    chain.pop();
  }
};

const resolve = (identifier: ServiceIdentifierType): unknown => {
  const binding = bindings.get(identifier);

  if (binding === undefined) {
    throw missingBinding(identifier);
  }

  if (binding.kind === "constant") {
    return binding.value;
  }

  if (binding.scope === EContainerScope.Singleton) {
    if (binding.instance !== UNRESOLVED) {
      return binding.instance;
    }

    const value = instantiate(binding);
    binding.instance = value;

    return value;
  }

  if (binding.scope === EContainerScope.Request) {
    request ??= new Map();
    const cached = request.get(binding);

    // A constructor never yields `undefined`, so one lookup is enough.
    if (cached !== undefined) {
      return cached;
    }

    const value = instantiate(binding);
    request.set(binding, value);

    return value;
  }

  return instantiate(binding);
};

export class Container implements IContainer {
  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor is needed for Bun function coverage
  public constructor() {}

  public add(target: ClassType, scope: EContainerScope = EContainerScope.Singleton): void {
    // Adding again replaces the binding: a cached singleton is dropped and the new scope applies.
    bindings.set(target, { kind: "instance", target, scope, plan: undefined, instance: UNRESOLVED });
  }

  public get<T>(target: ClassType<T>): T {
    // Every get() is its own request, even one issued from inside a constructor while another is in progress.
    const outer = request;
    request = undefined;

    try {
      return resolve(target) as T;
    } catch (e) {
      throw new ContainerException(
        `Failed to resolve dependency: ${target.name}. ${e instanceof Error ? e.message : String(e)}`,
        "SERVICE_RESOLVE_FAILED",
      );
    } finally {
      request = outer;
    }
  }

  public has(target: ClassType): boolean {
    return bindings.has(target);
  }

  public remove(target: ClassType): void {
    bindings.delete(target);
  }

  public addConstant<T>(identifier: string | symbol, value: T): void {
    bindings.set(identifier, { kind: "constant", value });
  }

  public getConstant<T>(identifier: string | symbol): T {
    const binding = bindings.get(identifier);

    if (binding?.kind !== "constant") {
      throw new ContainerException(`Failed to resolve constant: ${identifier.toString()}`, "CONSTANT_RESOLVE_FAILED");
    }

    return binding.value as T;
  }

  public hasConstant(identifier: string | symbol): boolean {
    return bindings.has(identifier);
  }

  public removeConstant(identifier: string | symbol): void {
    bindings.delete(identifier);
  }
}

export const container: Container = new Container();
