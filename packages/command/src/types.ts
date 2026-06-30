// biome-ignore lint/suspicious/noExplicitAny: trust me
export type CommandClassType = new (...args: any[]) => ICommand;

export interface ICommand<Options extends Record<string, unknown> = Record<string, unknown>> {
  run: (options: Options) => Promise<void> | void;
  getName: () => string;
  getDescription: () => string;
}
