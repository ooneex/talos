import { describe, expect, mock, test } from "bun:test";
import { RedisPubSub } from "@/RedisPubSub";
import type { IEventClient, PubSubMessageHandlerType } from "@/types";

type TestData = { message: string; count: number };

const createMockClient = (): IEventClient<TestData> => ({
  publish: mock(() => Promise.resolve()),
  subscribe: mock(() => Promise.resolve()),
  unsubscribe: mock(() => Promise.resolve()),
  unsubscribeAll: mock(() => Promise.resolve()),
  close: mock(() => {}),
});

class TestPubSub extends RedisPubSub<TestData> {
  private channel = "test-channel";
  public handlerCalls: Array<{ data: TestData; channel: string }> = [];

  public getChannel(): string {
    return this.channel;
  }

  public setChannel(channel: string): void {
    this.channel = channel;
  }

  public handler(context: { data: TestData; channel: string }): void {
    this.handlerCalls.push(context);
  }
}

class AsyncChannelPubSub extends RedisPubSub<TestData> {
  private channel = "async-channel";

  public async getChannel(): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return this.channel;
  }

  public handler(): void {
    // noop
  }
}

describe("RedisPubSub", () => {
  describe("Constructor", () => {
    test("should create instance with client", () => {
      const client = createMockClient();
      const pubsub = new TestPubSub(client);

      expect(pubsub).toBeInstanceOf(RedisPubSub);
    });
  });

  describe("getChannel", () => {
    test("should return channel from concrete implementation", () => {
      const client = createMockClient();
      const pubsub = new TestPubSub(client);

      expect(pubsub.getChannel()).toBe("test-channel");
    });

    test("should allow changing channel", () => {
      const client = createMockClient();
      const pubsub = new TestPubSub(client);

      pubsub.setChannel("new-channel");
      expect(pubsub.getChannel()).toBe("new-channel");
    });

    test("should support async getChannel", async () => {
      const client = createMockClient();
      const pubsub = new AsyncChannelPubSub(client);

      const channel = await pubsub.getChannel();
      expect(channel).toBe("async-channel");
    });
  });

  describe("publish", () => {
    test("should call client publish with correct parameters", async () => {
      const client = createMockClient();
      const pubsub = new TestPubSub(client);
      const data: TestData = { message: "hello", count: 42 };

      await pubsub.publish(data);

      expect(client.publish).toHaveBeenCalledTimes(1);
      expect(client.publish).toHaveBeenCalledWith({
        channel: "test-channel",
        data,
      });
    });

    test("should await async getChannel before publishing", async () => {
      const client = createMockClient();
      const pubsub = new AsyncChannelPubSub(client);
      const data: TestData = { message: "async", count: 5 };

      await pubsub.publish(data);

      expect(client.publish).toHaveBeenCalledWith({
        channel: "async-channel",
        data,
      });
    });

    test("should propagate errors from client publish", async () => {
      const client = createMockClient();
      const error = new Error("Publish failed");
      (client.publish as ReturnType<typeof mock>).mockRejectedValueOnce(error);

      const pubsub = new TestPubSub(client);

      expect(pubsub.publish({ message: "test", count: 0 })).rejects.toThrow("Publish failed");
    });
  });

  describe("subscribe", () => {
    test("should call client subscribe with channel and bound handler", async () => {
      const client = createMockClient();
      const pubsub = new TestPubSub(client);

      await pubsub.subscribe();

      expect(client.subscribe).toHaveBeenCalledTimes(1);
      expect(client.subscribe).toHaveBeenCalledWith("test-channel", expect.any(Function));
    });

    test("should await async getChannel before subscribing", async () => {
      const client = createMockClient();
      const pubsub = new AsyncChannelPubSub(client);

      await pubsub.subscribe();

      expect(client.subscribe).toHaveBeenCalledWith("async-channel", expect.any(Function));
    });

    test("should propagate errors from client subscribe", async () => {
      const client = createMockClient();
      const error = new Error("Subscribe failed");
      (client.subscribe as ReturnType<typeof mock>).mockRejectedValueOnce(error);

      const pubsub = new TestPubSub(client);

      expect(pubsub.subscribe()).rejects.toThrow("Subscribe failed");
    });

    test("should bind handler to pubsub instance", async () => {
      const client = createMockClient();
      let capturedHandler: PubSubMessageHandlerType<TestData> | undefined;

      (client.subscribe as ReturnType<typeof mock>).mockImplementation(
        async (_channel: string, handler: PubSubMessageHandlerType<TestData>) => {
          capturedHandler = handler;
        },
      );

      const pubsub = new TestPubSub(client);
      await pubsub.subscribe();

      expect(capturedHandler).toBeDefined();

      capturedHandler?.({ data: { message: "test", count: 1 }, channel: "test-channel" });

      expect(pubsub.handlerCalls).toHaveLength(1);
      expect(pubsub.handlerCalls[0]).toEqual({
        data: { message: "test", count: 1 },
        channel: "test-channel",
      });
    });
  });

  describe("unsubscribe", () => {
    test("should call client unsubscribe with channel", async () => {
      const client = createMockClient();
      const pubsub = new TestPubSub(client);

      await pubsub.unsubscribe();

      expect(client.unsubscribe).toHaveBeenCalledTimes(1);
      expect(client.unsubscribe).toHaveBeenCalledWith("test-channel");
    });

    test("should await async getChannel before unsubscribing", async () => {
      const client = createMockClient();
      const pubsub = new AsyncChannelPubSub(client);

      await pubsub.unsubscribe();

      expect(client.unsubscribe).toHaveBeenCalledWith("async-channel");
    });

    test("should propagate errors from client unsubscribe", async () => {
      const client = createMockClient();
      const error = new Error("Unsubscribe failed");
      (client.unsubscribe as ReturnType<typeof mock>).mockRejectedValueOnce(error);

      const pubsub = new TestPubSub(client);

      expect(pubsub.unsubscribe()).rejects.toThrow("Unsubscribe failed");
    });
  });

  describe("unsubscribeAll", () => {
    test("should call client unsubscribeAll", async () => {
      const client = createMockClient();
      const pubsub = new TestPubSub(client);

      await pubsub.unsubscribeAll();

      expect(client.unsubscribeAll).toHaveBeenCalledTimes(1);
    });

    test("should propagate errors from client unsubscribeAll", async () => {
      const client = createMockClient();
      const error = new Error("Unsubscribe all failed");
      (client.unsubscribeAll as ReturnType<typeof mock>).mockRejectedValueOnce(error);

      const pubsub = new TestPubSub(client);

      expect(pubsub.unsubscribeAll()).rejects.toThrow("Unsubscribe all failed");
    });
  });

  describe("handler", () => {
    test("should be called with correct context", async () => {
      const client = createMockClient();
      let capturedHandler: PubSubMessageHandlerType<TestData> | undefined;

      (client.subscribe as ReturnType<typeof mock>).mockImplementation(
        async (_channel: string, handler: PubSubMessageHandlerType<TestData>) => {
          capturedHandler = handler;
        },
      );

      const pubsub = new TestPubSub(client);
      await pubsub.subscribe();

      const context = {
        data: { message: "handler test", count: 99 },
        channel: "test-channel",
      };

      capturedHandler?.(context);

      expect(pubsub.handlerCalls).toHaveLength(1);
      expect(pubsub.handlerCalls[0]).toEqual(context);
    });

    test("should handle multiple messages", async () => {
      const client = createMockClient();
      let capturedHandler: PubSubMessageHandlerType<TestData> | undefined;

      (client.subscribe as ReturnType<typeof mock>).mockImplementation(
        async (_channel: string, handler: PubSubMessageHandlerType<TestData>) => {
          capturedHandler = handler;
        },
      );

      const pubsub = new TestPubSub(client);
      await pubsub.subscribe();

      capturedHandler?.({ data: { message: "msg1", count: 1 }, channel: "test-channel" });
      capturedHandler?.({ data: { message: "msg2", count: 2 }, channel: "test-channel" });
      capturedHandler?.({ data: { message: "msg3", count: 3 }, channel: "test-channel" });

      expect(pubsub.handlerCalls).toHaveLength(3);
      expect(pubsub.handlerCalls[0]?.data.message).toBe("msg1");
      expect(pubsub.handlerCalls[1]?.data.message).toBe("msg2");
      expect(pubsub.handlerCalls[2]?.data.message).toBe("msg3");
    });
  });

  describe("Integration scenarios", () => {
    test("should support full publish/subscribe workflow", async () => {
      const client = createMockClient();
      const pubsub = new TestPubSub(client);

      await pubsub.subscribe();
      await pubsub.publish({ message: "test", count: 1 });
      await pubsub.unsubscribe();

      expect(client.subscribe).toHaveBeenCalledTimes(1);
      expect(client.publish).toHaveBeenCalledTimes(1);
      expect(client.unsubscribe).toHaveBeenCalledTimes(1);
    });

    test("should support multiple subscriptions and unsubscribeAll", async () => {
      const client = createMockClient();
      const pubsub1 = new TestPubSub(client);
      const pubsub2 = new TestPubSub(client);
      pubsub2.setChannel("channel-2");

      await pubsub1.subscribe();
      await pubsub2.subscribe();
      await pubsub1.unsubscribeAll();

      expect(client.subscribe).toHaveBeenCalledTimes(2);
      expect(client.unsubscribeAll).toHaveBeenCalledTimes(1);
    });
  });
});
