import type { BulkJobOptions, Queue as BullQueue, Job, JobsOptions, Worker } from "bullmq";
import type { IQueue, QueueHandlerReturnType, ScalarType } from "./types";

export abstract class Queue<T extends Record<string, ScalarType> = Record<string, ScalarType>, R = unknown>
  implements IQueue<T, R>
{
  protected abstract queue: BullQueue<T, R>;
  protected abstract worker: Worker<T, R>;

  public abstract handler(job: Job<T, R>): QueueHandlerReturnType<R>;

  public async add(name: string, data: T, opts?: JobsOptions): Promise<Job<T, R>> {
    // The job name is a free-form string here; bullmq's Queue narrows it to a
    // deferred conditional type when DataType is a generic, so call through a
    // loosened reference and re-assert the concrete job type.
    return (await (this.queue as BullQueue).add(name, data, opts)) as Job<T, R>;
  }

  public async addBulk(jobs: { name: string; data: T; opts?: BulkJobOptions }[]): Promise<Job<T, R>[]> {
    return (await (this.queue as BullQueue).addBulk(jobs)) as Job<T, R>[];
  }

  public async removeJob(id: string): Promise<number> {
    return await this.queue.remove(id);
  }

  // Wire the optional worker event hooks declared on IQueue to the underlying
  // worker. Subclasses call this once their worker has been created.
  protected registerEvents(): void {
    const self = this as IQueue<T, R>;

    if (self.onActive) this.worker.on("active", self.onActive.bind(self));
    if (self.onCompleted) this.worker.on("completed", self.onCompleted.bind(self));
    if (self.onFailed) this.worker.on("failed", self.onFailed.bind(self));
    if (self.onProgress) this.worker.on("progress", self.onProgress.bind(self));
    if (self.onStalled) this.worker.on("stalled", self.onStalled.bind(self));
    if (self.onDrained) this.worker.on("drained", self.onDrained.bind(self));
    if (self.onPaused) this.worker.on("paused", self.onPaused.bind(self));
    if (self.onResumed) this.worker.on("resumed", self.onResumed.bind(self));
    if (self.onClosing) this.worker.on("closing", self.onClosing.bind(self));
    if (self.onClosed) this.worker.on("closed", self.onClosed.bind(self));
    if (self.onReady) this.worker.on("ready", self.onReady.bind(self));
    if (self.onError) this.worker.on("error", self.onError.bind(self));
  }

  public async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
