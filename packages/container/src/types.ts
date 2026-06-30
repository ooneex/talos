/** biome-ignore-all lint/suspicious/noExplicitAny: trust me */

export enum EContainerScope {
  Singleton = "singleton",
  Transient = "transient",
  Request = "request",
}

export interface IContainer {
  add: (target: new (...args: any[]) => any, scope?: EContainerScope) => void;
  get: <T>(target: new (...args: any[]) => T) => T;
  has: (target: new (...args: any[]) => unknown) => boolean;
  remove: (target: new (...args: any[]) => unknown) => void;
  addConstant: <T>(identifier: string | symbol, value: T) => void;
  getConstant: <T>(identifier: string | symbol) => T;
  hasConstant: (identifier: string | symbol) => boolean;
  removeConstant(identifier: string | symbol): void;
}
