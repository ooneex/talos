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
  let currentContext = context;

  for (const MiddlewareClass of middlewares) {
    const middleware = container.get(MiddlewareClass);
    currentContext = await middleware.handler(currentContext);
  }

  return currentContext;
};
