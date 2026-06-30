import { describe, expect, test } from "bun:test";
import type { IResponse } from "@talosjs/http-response";
import type { ContextConfigType, ContextType, IController } from "@/index";

const expectType = <T>(_value: T): void => {};

type ProductContextConfigType = ContextConfigType & {
  params: {
    id: string;
  };
  payload: {
    name: string;
  };
  queries: {
    includeArchived?: boolean;
  };
  response: {
    ok: boolean;
    id: string;
  };
};

class ProductController implements IController<ProductContextConfigType> {
  public index(context: ContextType<ProductContextConfigType>): IResponse<ProductContextConfigType["response"]> {
    expectType<string>(context.params.id);
    expectType<string>(context.payload.name);
    expectType<boolean | undefined>(context.queries.includeArchived);
    expectType<ContextType<ProductContextConfigType>["route"]>(context.route);
    expectType<ContextType<ProductContextConfigType>["cache"]>(context.cache);
    expectType<ContextType<ProductContextConfigType>["permission"]>(context.permission);
    expectType<ContextType<ProductContextConfigType>["rateLimiter"]>(context.rateLimiter);

    if (context.route?.roles) {
      expectType<Uppercase<string>[]>(context.route.roles);
    }

    return context.response.json({ ok: true, id: context.params.id });
  }
}

describe("controller public types", () => {
  test("exports a typed controller context contract", () => {
    const controller: IController<ProductContextConfigType> = new ProductController();

    expect(controller.index).toBeTypeOf("function");
  });

  test("supports controllers returning a stream response", () => {
    class StreamController implements IController {
      public index(context: ContextType): IResponse {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("chunk"));
            controller.close();
          },
        });

        return context.response.stream(body, { contentType: "application/octet-stream" });
      }
    }

    const controller: IController = new StreamController();

    expect(controller.index).toBeTypeOf("function");
  });

  test("supports controllers that push a server-side stream", () => {
    class PushStreamController implements IController {
      public index(context: ContextType): IResponse {
        return context.response.stream(async (writer) => {
          await writer.write("chunk-1");
          await writer.write("chunk-2");
        });
      }
    }

    const controller: IController = new PushStreamController();

    expect(controller.index).toBeTypeOf("function");
  });

  test("supports controllers returning Server-Sent Events", () => {
    class SseController implements IController {
      public index(context: ContextType): IResponse {
        return context.response.sse(async (writer) => {
          await writer.send({ event: "tick", data: { count: 1 } });
          await writer.comment("keep-alive");
        });
      }
    }

    const controller: IController = new SseController();

    expect(controller.index).toBeTypeOf("function");
  });

  test("rejects responses that do not match the configured response shape", () => {
    const controller: IController<ProductContextConfigType> = {
      index: (context) => {
        // @ts-expect-error missing the required id field from ProductContextConfigType["response"]
        return context.response.json({ ok: true });
      },
    };

    expect(controller.index).toBeTypeOf("function");
  });
});
