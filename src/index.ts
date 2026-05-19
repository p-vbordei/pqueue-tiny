export interface QueueOptions {
  /** Maximum tasks running concurrently. Default 1. */
  concurrency?: number;
  /** Aborting this signal cancels all pending tasks immediately. Running tasks complete on their own. */
  signal?: AbortSignal;
}

export interface AddOptions {
  /** Higher = served first. Default 0. Tasks with equal priority preserve FIFO order. */
  priority?: number;
  /** Per-task signal. Aborting only cancels this task if it has not yet started. */
  signal?: AbortSignal;
}

interface Task {
  priority: number;
  seq: number;
  run: () => void;
  cancel: (reason: unknown) => void;
}

/**
 * Tiny concurrency-limited promise queue. Supports priorities, per-task and
 * queue-wide `AbortSignal`, and an `onIdle()` awaitable.
 */
export class PQueue {
  private readonly concurrency: number;
  private readonly queueAbort?: AbortSignal;
  private running = 0;
  private nextSeq = 0;
  private readonly queue: Task[] = [];
  private idleResolvers: Array<() => void> = [];
  private aborted = false;

  constructor(opts: QueueOptions = {}) {
    this.concurrency = Math.max(1, opts.concurrency ?? 1);
    this.queueAbort = opts.signal;
    if (this.queueAbort) {
      if (this.queueAbort.aborted) this.abortAll(this.queueAbort.reason);
      else this.queueAbort.addEventListener("abort", () => this.abortAll(this.queueAbort!.reason), { once: true });
    }
  }

  /** Number of tasks currently waiting in the queue. */
  get size(): number {
    return this.queue.length;
  }

  /** Number of tasks currently executing. */
  get pending(): number {
    return this.running;
  }

  /** Total tasks in flight (waiting + executing). */
  get inFlight(): number {
    return this.queue.length + this.running;
  }

  /**
   * Add a task. Returns a Promise that resolves with the task's value (or
   * rejects with the task's error / abort reason).
   */
  add<T>(fn: () => T | Promise<T>, opts: AddOptions = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.aborted) {
        reject(this.queueAbort?.reason ?? new Error("queue aborted"));
        return;
      }
      if (opts.signal?.aborted) {
        reject(opts.signal.reason ?? new Error("aborted"));
        return;
      }

      const task: Task = {
        priority: opts.priority ?? 0,
        seq: this.nextSeq++,
        run: async () => {
          this.running += 1;
          try {
            if (opts.signal?.aborted) {
              reject(opts.signal.reason ?? new Error("aborted"));
              return;
            }
            const r = await fn();
            resolve(r);
          } catch (e) {
            reject(e);
          } finally {
            this.running -= 1;
            this.flushIdleIfDone();
            this.tick();
          }
        },
        cancel: (reason) => reject(reason),
      };

      const handleAbort = () => {
        const idx = this.queue.indexOf(task);
        if (idx >= 0) {
          this.queue.splice(idx, 1);
          task.cancel(opts.signal!.reason ?? new Error("aborted"));
        }
      };
      opts.signal?.addEventListener("abort", handleAbort, { once: true });

      // Insert by priority (desc), then by seq (asc)
      let insertAt = this.queue.length;
      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i]!.priority < task.priority) {
          insertAt = i;
          break;
        }
      }
      this.queue.splice(insertAt, 0, task);
      this.tick();
    });
  }

  /** Resolves once all currently-pending tasks have completed. */
  onIdle(): Promise<void> {
    if (this.inFlight === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleResolvers.push(resolve));
  }

  /** Cancel everything that hasn't started yet. Running tasks finish on their own. */
  clear(): void {
    const drained = this.queue.splice(0, this.queue.length);
    for (const t of drained) t.cancel(new Error("cleared from queue"));
    this.flushIdleIfDone();
  }

  private abortAll(reason: unknown): void {
    this.aborted = true;
    const drained = this.queue.splice(0, this.queue.length);
    for (const t of drained) t.cancel(reason ?? new Error("queue aborted"));
    this.flushIdleIfDone();
  }

  private tick(): void {
    if (this.aborted) return;
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      task.run();
    }
  }

  private flushIdleIfDone(): void {
    if (this.inFlight !== 0) return;
    const resolvers = this.idleResolvers.splice(0, this.idleResolvers.length);
    for (const r of resolvers) r();
  }
}
