export type ServiceClassType = new (...args: any[]) => IService;

export interface IService {
  execute: (data?: any) => Promise<any> | any;
}
