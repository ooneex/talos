import { describe, expect, test } from "bun:test";
import { AsyncLock } from "../../src/orm/AsyncLock";

describe("AsyncLock", () => {
  test("acquire should resolve immediately when nobody holds the lock", async () => {
    const lock = new AsyncLock();

    const release = await lock.acquire();

    expect(typeof release).toBe("function");
    release();
  });

  test("acquire should block until the previous holder releases", async () => {
    const lock = new AsyncLock();
    const events: string[] = [];

    const first = await lock.acquire();
    const second = lock.acquire().then((release) => {
      events.push("second acquired");

      return release;
    });

    await Promise.resolve();
    expect(events).toEqual([]);

    first();
    const releaseSecond = await second;

    expect(events).toEqual(["second acquired"]);
    releaseSecond();
  });

  test("acquire should hand the lock over in FIFO order", async () => {
    const lock = new AsyncLock();
    const order: number[] = [];

    const run = async (id: number, delay: number): Promise<void> => {
      const release = await lock.acquire();

      order.push(id);
      await Bun.sleep(delay);
      release();
    };

    await Promise.all([run(1, 5), run(2, 1), run(3, 1)]);

    expect(order).toEqual([1, 2, 3]);
  });

  test("a released lock can be acquired again", async () => {
    const lock = new AsyncLock();

    (await lock.acquire())();
    (await lock.acquire())();
    const release = await lock.acquire();

    expect(typeof release).toBe("function");
    release();
  });
});
