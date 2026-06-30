import { describe, expect, test } from "bun:test";
import type { IResponse } from "@talosjs/http-response";
import type { ServerWebSocket } from "bun";
import type { ContextConfigType, ContextType, IController } from "@/index";

const expectType = <T>(_value: T): void => {};

type ChatContextConfigType = ContextConfigType & {
  params: {
    roomId: string;
  };
  payload: {
    message: string;
  };
  queries: {
    replay?: boolean;
  };
  response: {
    event: string;
    roomId: string;
  };
};

class ChatController implements IController<ChatContextConfigType> {
  public async index(context: ContextType<ChatContextConfigType>): Promise<void> {
    expectType<string>(context.params.roomId);
    expectType<string>(context.payload.message);
    expectType<boolean | undefined>(context.queries.replay);
    expectType<ServerWebSocket<ChatContextConfigType["response"]>>(context.channel.ws);
    expectType<(response: IResponse<ChatContextConfigType["response"]>) => Promise<void>>(context.channel.send);
    expectType<(response: IResponse<ChatContextConfigType["response"]>) => Promise<void>>(context.channel.publish);
    expectType<() => Promise<void>>(context.channel.subscribe);
    expectType<() => Promise<void>>(context.channel.unsubscribe);
    expectType<() => boolean>(context.channel.isSubscribed);

    await context.channel.subscribe();
    await context.channel.send(context.response.json({ event: "message", roomId: context.params.roomId }));
    await context.channel.publish(context.response.json({ event: "connected", roomId: context.params.roomId }));
  }
}

describe("socket public types", () => {
  test("exports a typed socket controller context contract", () => {
    const controller: IController<ChatContextConfigType> = new ChatController();

    expect(controller.index).toBeTypeOf("function");
  });

  test("rejects responses that do not match the configured response shape", () => {
    const controller: IController<ChatContextConfigType> = {
      index: async (context) => {
        // @ts-expect-error missing the required roomId field from ChatContextConfigType["response"]
        await context.channel.send(context.response.json({ event: "connected" }));
      },
    };

    expect(controller.index).toBeTypeOf("function");
  });
});
