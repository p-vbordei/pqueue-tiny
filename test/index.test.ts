import { describe, it, expect } from "vitest";
import { PQueue } from "../src/index.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("concurrency", () => {
  it("respects concurrency=1", async () => {
    const q = new PQueue({ concurrency: 1 });
    const order: number[] = [];
    let active = 0;
    let maxActive = 0;
    const task = (i: number) => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(10);
      order.push(i);
      active--;
    };
    await Promise.all([q.add(task(1)), q.add(task(2)), q.add(task(3))]);
    expect(maxActive).toBe(1);
    expect(order).toEqual([1, 2, 3]);
  });

  it("respects concurrency=2", async () => {
    const q = new PQueue({ concurrency: 2 });
    let active = 0;
    let maxActive = 0;
    const t = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(20);
      active--;
    };
    await Promise.all([q.add(t), q.add(t), q.add(t), q.add(t)]);
    expect(maxActive).toBe(2);
  });
});

describe("returns task value", () => {
  it("resolves with the task's return", async () => {
    const q = new PQueue();
    expect(await q.add(async () => 42)).toBe(42);
  });
  it("rejects with the task's error", async () => {
    const q = new PQueue();
    await expect(q.add(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });
});

describe("priority", () => {
  it("higher priority runs first among pending", async () => {
    const q = new PQueue({ concurrency: 1 });
    const order: string[] = [];
    // First task blocks slot 1
    const blocker = q.add(async () => { await sleep(20); order.push("blocker"); });
    // While blocker runs, queue these
    q.add(async () => { order.push("low"); }, { priority: 0 });
    q.add(async () => { order.push("high"); }, { priority: 10 });
    q.add(async () => { order.push("mid"); }, { priority: 5 });
    await blocker;
    await q.onIdle();
    expect(order).toEqual(["blocker", "high", "mid", "low"]);
  });

  it("FIFO within same priority", async () => {
    const q = new PQueue({ concurrency: 1 });
    const order: number[] = [];
    const blocker = q.add(async () => { await sleep(20); });
    for (let i = 1; i <= 4; i++) {
      q.add(async () => { order.push(i); });
    }
    await blocker;
    await q.onIdle();
    expect(order).toEqual([1, 2, 3, 4]);
  });
});

describe("AbortSignal", () => {
  it("queue-level abort cancels pending tasks", async () => {
    const ac = new AbortController();
    const q = new PQueue({ concurrency: 1, signal: ac.signal });
    const blocker = q.add(async () => { await sleep(50); });
    const cancelled = q.add(async () => "should never run");
    ac.abort(new Error("stop"));
    await expect(cancelled).rejects.toThrow("stop");
    await blocker;
  });

  it("per-task abort cancels only that task while waiting", async () => {
    const q = new PQueue({ concurrency: 1 });
    const ac = new AbortController();
    const blocker = q.add(async () => { await sleep(20); });
    const waiting = q.add(async () => "result", { signal: ac.signal });
    const other = q.add(async () => "other");
    ac.abort(new Error("nope"));
    await expect(waiting).rejects.toThrow("nope");
    await expect(other).resolves.toBe("other");
    await blocker;
  });

  it("rejects immediately if signal already aborted", async () => {
    const q = new PQueue();
    const ac = new AbortController();
    ac.abort(new Error("pre-aborted"));
    await expect(q.add(async () => 1, { signal: ac.signal })).rejects.toThrow("pre-aborted");
  });
});

describe("onIdle / clear", () => {
  it("onIdle resolves when queue drained", async () => {
    const q = new PQueue({ concurrency: 2 });
    for (let i = 0; i < 5; i++) q.add(async () => { await sleep(10); });
    await q.onIdle();
    expect(q.inFlight).toBe(0);
  });

  it("clear cancels waiting tasks", async () => {
    const q = new PQueue({ concurrency: 1 });
    const blocker = q.add(async () => { await sleep(20); });
    const cancelled = q.add(async () => "never");
    q.clear();
    await expect(cancelled).rejects.toThrow();
    await blocker;
  });

  it("size and pending counters", async () => {
    const q = new PQueue({ concurrency: 1 });
    expect(q.inFlight).toBe(0);
    const blocker = q.add(async () => { await sleep(20); });
    q.add(async () => 1);
    expect(q.size).toBe(1);
    expect(q.pending).toBe(1);
    await blocker;
    await q.onIdle();
  });
});
