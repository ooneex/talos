/**
 * A FIFO mutex. `acquire()` resolves with the release function once every earlier holder released.
 *
 * SQLite exposes one connection, so imperative transactions must not interleave; the runner takes this
 * lock for the duration of a transaction on drivers that cannot reserve a dedicated connection.
 */
export class AsyncLock {
  private tail: Promise<void> = Promise.resolve();

  public async acquire(): Promise<() => void> {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.tail;

    this.tail = previous.then(() => held);
    await previous;

    return release;
  }
}
