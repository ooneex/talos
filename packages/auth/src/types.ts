// biome-ignore lint/suspicious/noExplicitAny: trust me
export type AuthClassType = new (...args: any[]) => IAuth;

export interface IAuth {
  getCurrentUser: (token?: string) => Promise<unknown>;
}
