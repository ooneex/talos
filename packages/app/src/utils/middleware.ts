import { container } from "@talosjs/container";

type MiddlewareHandlerType<TContext> = {
  handler: (context: TContext) => Promise<TContext> | TContext;
};

// biome-ignore lint/suspicious/noExplicitAny: trust me
type MiddlewareHandlerClassType<TContext> = new (...args: any[]) => MiddlewareHandlerType<TContext>;

export const runMiddlewares = async <TContext>(
  context: TContext,
  middlewares: MiddlewareHandlerClassType<TContext>[],
): Promise<TContext> => {
  return middlewares.reduce<Promise<TContext>>(async (previousContext, MiddlewareClass) => {
    const middleware = container.get(MiddlewareClass);
    return middleware.handler(await previousContext);
  }, Promise.resolve(context));
};
