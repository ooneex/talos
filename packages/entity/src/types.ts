export type EntityClassType = new (...args: any[]) => IEntity;

export interface IEntity {
  id: string;
}
