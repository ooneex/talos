import type { ClassType, EContainerScope, ServiceIdentifierType } from "./types";

/** One entry per constructor parameter: the token to resolve, or `undefined` to let the default value apply. */
export type ArgumentsPlanType = readonly (ServiceIdentifierType | undefined)[];

export type InstanceBindingType = {
  kind: "instance";
  target: ClassType;
  scope: EContainerScope;
  /** Validated on the first instantiation, then reused by every later one. */
  plan: ArgumentsPlanType | undefined;
  /** The singleton instance, `UNRESOLVED` until built; unused by the other scopes. */
  instance: unknown;
};

export type ConstantBindingType = {
  kind: "constant";
  value: unknown;
};

export type BindingType = InstanceBindingType | ConstantBindingType;

/** Tokens by constructor parameter position; a hole is a parameter left to its default value. */
export type InjectionsType = (ServiceIdentifierType | undefined)[];

type RegistryType = {
  /** Every binding of the process, so decorators, packages and the application register into one graph. */
  bindings: Map<ServiceIdentifierType, BindingType>;
  /** Constructor tokens keyed by the decorated class itself, so a subclass never inherits its parent's. */
  injections: WeakMap<ClassType, InjectionsType>;
  /**
   * Resolution is synchronous, so a single chain of the classes under construction (innermost last) serves
   * every `get()`, including one issued from inside a constructor: no context object is allocated per call,
   * and a cycle that goes through such a nested call is caught instead of overflowing the stack.
   */
  chain: ClassType[];
  /** Request-scoped instances of the `get()` in progress, created on the first request-scoped binding met. */
  request: Map<InstanceBindingType, unknown> | undefined;
};

/**
 * A dependency graph routinely installs several copies of this package, one per semver range asked for.
 * Module-level state would give each copy its own graph, so a class registered through one copy stays
 * invisible to the copy that resolves it — `@talosjs/ai` registering a chat the application then cannot
 * inject. Hanging the state off the realm keeps every copy on one graph.
 *
 * The `.v1` suffix pins the record layout: a later, incompatible one takes a new key rather than handing
 * corrupt records to the copies that read this one.
 */
const REGISTRY_KEY: unique symbol = Symbol.for("@talosjs/container.registry.v1");

/**
 * Placeholder held by a singleton binding until its instance is built; avoids boxing the instance.
 * Registered so that every copy of this package recognises the placeholder written by the others.
 */
export const UNRESOLVED: unique symbol = Symbol.for("@talosjs/container.unresolved.v1");

const realm = globalThis as typeof globalThis & { [REGISTRY_KEY]?: RegistryType };

const create = (): RegistryType => {
  const created: RegistryType = {
    bindings: new Map(),
    injections: new WeakMap(),
    chain: [],
    request: undefined,
  };
  realm[REGISTRY_KEY] = created;

  return created;
};

export const registry: RegistryType = realm[REGISTRY_KEY] ?? create();
