// biome-ignore lint/suspicious/noExplicitAny: trust me
export type EntityClassType = new (...args: any[]) => IEntity;

export interface IEntity {
  id: string;
}
