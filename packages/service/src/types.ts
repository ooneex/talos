// biome-ignore lint/suspicious/noExplicitAny: trust me
export type ServiceClassType = new (...args: any[]) => IService;

export interface IService {
  // biome-ignore lint/suspicious/noExplicitAny: trust me
  execute: (data?: any) => Promise<any> | any;
}
