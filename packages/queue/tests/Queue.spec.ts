import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import type { Queue as BullQueue, BunRedisRawClient, Job, Worker } from "bullmq";
import { RedisClient } from "bun";
import { Queue, QueueException } from "@/index";

const REDIS_URL = "redis://localhost:6379";

// Capture the arguments the bullmq Queue constructor is called with.
const queueConstructorArgs: { name: string; opts: unknown }[] = [];

// Capture the arguments the bullmq Worker constructor is called with.
const workerConstructorArgs: { name: string; processor: unknown; opts: unknown }[] = [];

// Mock implementations of the underlying bullmq Queue methods.
const mockQueueMethods = {
  // biome-ignore lint/suspicious/noExplicitAny: mock job factory
  add: mock(async (name: string, data: any, opts?: unknown) => ({ id: "job-1", name, data, opts })),
  // biome-ignore lint/suspicious/noExplicitAny: mock job factory
  addBulk: mock(async (jobs: { name: string; data: any }[]) =>
    jobs.map((job, index) => ({ id: `job-${index}`, name: job.name, data: job.data })),
  ),
  remove: mock(async (_id: string): Promise<number> => 1),
  close: mock(async (): Promise<void> => {}),
};

// Mock implementations of the underlying bullmq Worker methods.
const mockWorkerMethods = {
  close: mock(async (): Promise<void> => {}),
};

// createBunRedisClient is mocked to simply pass through the raw client.
const createBunRedisClient = mock((client: unknown) => client);

// Stand-in for the bullmq Queue that records its constructor args instead of
// opening a real Redis connection.
class MockQueue {
  public add = mockQueueMethods.add;
  public addBulk = mockQueueMethods.addBulk;
  public remove = mockQueueMethods.remove;
  public close = mockQueueMethods.close;

  constructor(name: string, opts: unknown) {
    queueConstructorArgs.push({ name, opts });
  }
}

// Stand-in for the bullmq Worker that records its constructor args instead of
// opening a real (blocking) Redis connection.
class MockWorker {
  public close = mockWorkerMethods.close;

  constructor(name: string, processor: unknown, opts: unknown) {
    workerConstructorArgs.push({ name, processor, opts });
  }
}

// Replace the bullmq module so no real Redis connection is ever opened.
mock.module("bullmq", () => ({
  createBunRedisClient,
  Queue: MockQueue,
  Worker: MockWorker,
}));

// Concrete implementation used to exercise the abstract base class. The
// constructor now lives in the generated queue class (see the cli queue.txt
// template), so the test queue mirrors that shape.
class TestQueue extends Queue {
  protected queue: BullQueue;
  protected worker: Worker;

  constructor(protected readonly env: AppEnv) {
    super();

    if (!this.env.QUEUE_REDIS_URL) {
      throw new QueueException(
        "Queue Redis URL is required. Please set the QUEUE_REDIS_URL environment variable.",
        "QUEUE_REDIS_URL_REQUIRED",
      );
    }

    const rawClient = new RedisClient(this.env.QUEUE_REDIS_URL);
    const connection = createBunRedisClient(rawClient as BunRedisRawClient);
    this.queue = new MockQueue("<queue-name>", { connection }) as unknown as BullQueue;
    this.worker = new MockWorker("<queue-name>", (job: Job) => this.handler(job), { connection }) as unknown as Worker;
  }

  public async handler(job: Job): Promise<unknown> {
    return job.data;
  }
}

describe("Queue", () => {
  let queue: TestQueue;

  beforeAll(() => {
    Bun.env.QUEUE_REDIS_URL = REDIS_URL;
  });

  afterAll(() => {
    delete Bun.env.QUEUE_REDIS_URL;
  });

  beforeEach(() => {
    queueConstructorArgs.length = 0;
    workerConstructorArgs.length = 0;

    const mocksToReset = [
      mockQueueMethods.add,
      mockQueueMethods.addBulk,
      mockQueueMethods.remove,
      mockQueueMethods.close,
      mockWorkerMethods.close,
      createBunRedisClient,
    ];

    mocksToReset.forEach((mockFn) => {
      if (mockFn && typeof mockFn.mockClear === "function") {
        mockFn.mockClear();
      }
    });

    mockQueueMethods.add.mockImplementation(
      // biome-ignore lint/suspicious/noExplicitAny: mock job factory
      async (name: string, data: any, opts?: unknown) => ({ id: "job-1", name, data, opts }),
    );
    mockQueueMethods.addBulk.mockImplementation(
      // biome-ignore lint/suspicious/noExplicitAny: mock job factory
      async (jobs: { name: string; data: any }[]) =>
        jobs.map((job, index) => ({ id: `job-${index}`, name: job.name, data: job.data })),
    );
    mockQueueMethods.remove.mockImplementation(async (_id: string): Promise<number> => 1);
    mockQueueMethods.close.mockImplementation(async (): Promise<void> => {});
    mockWorkerMethods.close.mockImplementation(async (): Promise<void> => {});

    queue = new TestQueue(new AppEnv());
  });

  describe("constructor", () => {
    test("should throw QueueException when QUEUE_REDIS_URL is missing", () => {
      delete Bun.env.QUEUE_REDIS_URL;
      const env = new AppEnv();

      expect(() => new TestQueue(env)).toThrow(QueueException);

      Bun.env.QUEUE_REDIS_URL = REDIS_URL;
    });

    test("should throw with the QUEUE_REDIS_URL_REQUIRED key when URL is missing", () => {
      delete Bun.env.QUEUE_REDIS_URL;
      const env = new AppEnv();

      try {
        new TestQueue(env);
        expect(true).toBe(false); // should not reach here
        // biome-ignore lint/suspicious/noExplicitAny: trust me
      } catch (error: any) {
        expect(error).toBeInstanceOf(QueueException);
        expect(error.key).toBe("QUEUE_REDIS_URL_REQUIRED");
      } finally {
        Bun.env.QUEUE_REDIS_URL = REDIS_URL;
      }
    });

    test("should construct the bullmq Queue with a connection", () => {
      new TestQueue(new AppEnv());

      const lastCall = queueConstructorArgs.at(-1);
      expect(lastCall?.name).toBe("<queue-name>");
      expect(lastCall?.opts).toHaveProperty("connection");
    });

    test("should build the connection through createBunRedisClient", () => {
      new TestQueue(new AppEnv());

      expect(createBunRedisClient).toHaveBeenCalled();
    });

    test("should construct the bullmq Worker with a connection", () => {
      new TestQueue(new AppEnv());

      const lastCall = workerConstructorArgs.at(-1);
      expect(lastCall?.name).toBe("<queue-name>");
      expect(lastCall?.opts).toHaveProperty("connection");
    });

    test("should wire the worker processor to the handler", () => {
      new TestQueue(new AppEnv());

      const lastCall = workerConstructorArgs.at(-1);
      expect(typeof lastCall?.processor).toBe("function");
    });

    test("should share a single connection between the queue and the worker", () => {
      createBunRedisClient.mockClear();

      new TestQueue(new AppEnv());

      // A single adapted connection is reused by both the queue and the worker.
      expect(createBunRedisClient).toHaveBeenCalledTimes(1);

      const queueConnection = (queueConstructorArgs.at(-1)?.opts as { connection: unknown }).connection;
      const workerConnection = (workerConstructorArgs.at(-1)?.opts as { connection: unknown }).connection;
      expect(workerConnection).toBe(queueConnection);
    });
  });

  describe("handler", () => {
    test("should be invoked when the worker processes a job", async () => {
      new TestQueue(new AppEnv());

      const processor = workerConstructorArgs.at(-1)?.processor as (job: Job) => Promise<unknown>;
      const result = await processor({ data: { value: 1 } } as unknown as Job);

      expect(result).toEqual({ value: 1 });
    });
  });

  describe("add", () => {
    test("should delegate to the underlying queue with name and data", async () => {
      const data = { to: "user@example.com", subject: "Hi" };
      await queue.add("send-email", data);

      expect(mockQueueMethods.add).toHaveBeenCalledWith("send-email", data, undefined);
    });

    test("should forward job options", async () => {
      const data = { value: 1 };
      const opts = { delay: 5000, attempts: 3 };
      await queue.add("delayed-job", data, opts);

      expect(mockQueueMethods.add).toHaveBeenCalledWith("delayed-job", data, opts);
    });

    test("should return the created job", async () => {
      const job = (await queue.add("job", { value: 42 })) as unknown as {
        id: string;
        name: string;
        data: { value: number };
        opts: unknown;
      };

      expect(job).toEqual({ id: "job-1", name: "job", data: { value: 42 }, opts: undefined });
    });

    test("should support scalar data types", async () => {
      const data = { str: "text", num: 7, bool: true, big: BigInt(10) };
      await queue.add("scalars", data);

      expect(mockQueueMethods.add).toHaveBeenCalledWith("scalars", data, undefined);
    });

    test("should propagate errors from the underlying queue", async () => {
      mockQueueMethods.add.mockRejectedValue(new Error("Redis connection failed"));

      expect(queue.add("job", { value: 1 })).rejects.toThrow("Redis connection failed");
    });
  });

  describe("addBulk", () => {
    test("should delegate the bulk jobs to the underlying queue", async () => {
      const jobs = [
        { name: "job-a", data: { value: 1 } },
        { name: "job-b", data: { value: 2 } },
      ];
      await queue.addBulk(jobs);

      expect(mockQueueMethods.addBulk).toHaveBeenCalledWith(jobs);
    });

    test("should return all created jobs", async () => {
      const jobs = [
        { name: "job-a", data: { value: 1 } },
        { name: "job-b", data: { value: 2 } },
      ];
      const result = (await queue.addBulk(jobs)) as unknown as {
        id: string;
        name: string;
        data: { value: number };
      }[];

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "job-0", name: "job-a", data: { value: 1 } });
      expect(result[1]).toEqual({ id: "job-1", name: "job-b", data: { value: 2 } });
    });

    test("should handle an empty job list", async () => {
      const result = await queue.addBulk([]);

      expect(result).toEqual([]);
      expect(mockQueueMethods.addBulk).toHaveBeenCalledWith([]);
    });

    test("should propagate errors from the underlying queue", async () => {
      mockQueueMethods.addBulk.mockRejectedValue(new Error("Bulk add failed"));

      expect(queue.addBulk([{ name: "job", data: { value: 1 } }])).rejects.toThrow("Bulk add failed");
    });
  });

  describe("removeJob", () => {
    test("should delegate to the underlying queue remove method", async () => {
      await queue.removeJob("job-123");

      expect(mockQueueMethods.remove).toHaveBeenCalledWith("job-123");
    });

    test("should return the number of removed jobs", async () => {
      mockQueueMethods.remove.mockResolvedValue(1);

      const result = await queue.removeJob("job-123");
      expect(result).toBe(1);
    });

    test("should return 0 when the job does not exist", async () => {
      mockQueueMethods.remove.mockResolvedValue(0);

      const result = await queue.removeJob("missing");
      expect(result).toBe(0);
    });

    test("should propagate errors from the underlying queue", async () => {
      mockQueueMethods.remove.mockRejectedValue(new Error("Remove failed"));

      expect(queue.removeJob("job-123")).rejects.toThrow("Remove failed");
    });
  });

  describe("close", () => {
    test("should delegate to the underlying queue close method", async () => {
      await queue.close();

      expect(mockQueueMethods.close).toHaveBeenCalled();
    });

    test("should delegate to the underlying worker close method", async () => {
      await queue.close();

      expect(mockWorkerMethods.close).toHaveBeenCalled();
    });

    test("should propagate errors from the underlying queue", async () => {
      mockQueueMethods.close.mockRejectedValue(new Error("Close failed"));

      expect(queue.close()).rejects.toThrow("Close failed");
    });

    test("should propagate errors from the underlying worker", async () => {
      mockWorkerMethods.close.mockRejectedValue(new Error("Worker close failed"));

      expect(queue.close()).rejects.toThrow("Worker close failed");
    });
  });
});
