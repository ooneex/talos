/** biome-ignore-all lint/suspicious/noExplicitAny: trust me */

export enum EContainerScope {
  Singleton = "singleton",
  Transient = "transient",
  Request = "request",
}

/** A concrete class the container can instantiate. */
export type ClassType<T = unknown> = new (...args: any[]) => T;

/** What a binding is looked up by: a registered class or the string / symbol key of a constant. */
export type ServiceIdentifierType<T = unknown> = string | symbol | ClassType<T>;

export interface IContainer {
  add: (target: ClassType, scope?: EContainerScope) => void;
  get: <T>(target: ClassType<T>) => T;
  has: (target: ClassType) => boolean;
  remove: (target: ClassType) => void;
  addConstant: <T>(identifier: string | symbol, value: T) => void;
  getConstant: <T>(identifier: string | symbol) => T;
  hasConstant: (identifier: string | symbol) => boolean;
  removeConstant(identifier: string | symbol): void;
}
