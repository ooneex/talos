import type { Job, JobProgress } from "bullmq";

export type CleanJobType =
  | "completed"
  | "wait"
  | "waiting"
  | "active"
  | "paused"
  | "prioritized"
  | "delayed"
  | "failed";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type QueueClassType = new (...args: any[]) => IQueue;

export type QueueHandlerReturnType<R = unknown> = Promise<R> | R;

export interface IQueue<T extends Record<string, ScalarType> = Record<string, ScalarType>, R = unknown> {
  handler: (job: Job<T, R>) => QueueHandlerReturnType<R>;
  add: (name: string, data: T) => Promise<Job<T, R>> | Job<T, R>;
  addBulk: (jobs: { name: string; data: T }[]) => Promise<Job<T, R>[]> | Job<T, R>[];
  removeJob: (jobId: string) => Promise<number> | number;

  // Optional worker event hooks. See https://docs.bullmq.io/guide/workers
  // A job moved to "active" and started processing.
  onActive?: (job: Job<T, R>, prev: string) => void;
  // A job finished successfully; `result` is the value returned by `handler`.
  onCompleted?: (job: Job<T, R>, result: R, prev: string) => void;
  // A job threw during processing. `job` may be undefined if it could not be loaded.
  onFailed?: (job: Job<T, R> | undefined, error: Error, prev: string) => void;
  // A job reported progress via `job.updateProgress`.
  onProgress?: (job: Job<T, R>, progress: JobProgress) => void;
  // A job was detected as stalled and is about to be retried.
  onStalled?: (jobId: string, prev: string) => void;
  // The queue had no more jobs to process.
  onDrained?: () => void;
  // The worker was paused.
  onPaused?: () => void;
  // The worker was resumed.
  onResumed?: () => void;
  // The worker is closing.
  onClosing?: (message: string) => void;
  // The worker has closed.
  onClosed?: () => void;
  // The worker connected to Redis and is ready to process jobs.
  onReady?: () => void;
  // An error occurred in the worker. Always attach this to avoid unhandled exceptions.
  onError?: (error: Error) => void;
}

export type ScalarType = boolean | number | bigint | string;
