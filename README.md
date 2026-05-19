# pqueue-tiny

[![ci](https://github.com/p-vbordei/pqueue-tiny/actions/workflows/ci.yml/badge.svg)](https://github.com/p-vbordei/pqueue-tiny/actions/workflows/ci.yml)

[![npm](https://img.shields.io/npm/v/pqueue-tiny.svg)](https://www.npmjs.com/package/pqueue-tiny)
[![downloads](https://img.shields.io/npm/dm/pqueue-tiny.svg)](https://www.npmjs.com/package/pqueue-tiny)
[![bundle](https://img.shields.io/bundlejs/size/pqueue-tiny)](https://bundlejs.com/?q=pqueue-tiny)

> A tiny concurrency-limited promise queue with priorities, `AbortSignal` support, and an `onIdle()` awaitable. Zero dependencies.

```ts
import { PQueue } from "pqueue-tiny";

const q = new PQueue({ concurrency: 5 });

for (const url of urls) {
  q.add(() => fetch(url));
}
await q.onIdle();

// With priority
q.add(() => urgent(), { priority: 10 });

// With per-task abort
const ac = new AbortController();
q.add(() => slowJob(), { signal: ac.signal });
ac.abort();  // cancels if not yet started
```

## Install

```sh
npm install pqueue-tiny
```

Works with Node 20+, browsers, Bun, Deno. ESM + CJS.

## Why

`p-queue` is excellent but ~10KB minified with lots of options you usually don't need. `pqueue-tiny` is ~150 lines covering 90% of real use cases: bounded concurrency, priorities, abort, idle waiting.

## Recipes

### Bulk URL fetcher (rate-limit kindness)

```ts
import { PQueue } from "pqueue-tiny";

async function fetchAll(urls: string[]) {
  const q = new PQueue({ concurrency: 5 });
  const results = urls.map((u) => q.add(() => fetch(u).then((r) => r.json())));
  return Promise.all(results);
}
```

### Background queue with priorities

```ts
import { PQueue } from "pqueue-tiny";

const q = new PQueue({ concurrency: 2 });

// Background indexing — low priority
q.add(() => indexDocument(doc), { priority: 0 });

// User clicked save — high priority
q.add(() => saveImmediately(data), { priority: 100 });
```

### Cancel a specific job

```ts
import { PQueue } from "pqueue-tiny";

const q = new PQueue({ concurrency: 1 });
const ac = new AbortController();

const promise = q.add(() => slowProcessing(), { signal: ac.signal });
// User cancels:
ac.abort(new Error("user cancelled"));
// `promise` rejects with that error if the job was still pending; if running, completes naturally.
```

### Drain on shutdown

```ts
import { PQueue } from "pqueue-tiny";

const q = new PQueue({ concurrency: 4 });

process.on("SIGTERM", async () => {
  console.log(`draining ${q.inFlight} jobs...`);
  await q.onIdle();
  process.exit(0);
});
```

### Combine with pmap-bounded

For sequential `Promise.all` semantics with concurrency, prefer [pmap-bounded](https://github.com/p-vbordei/pmap-bounded). For a long-lived job queue with priorities and abort, use `pqueue-tiny`.

## API

### `new PQueue(opts?)`

| Option | Type | Default |
|---|---|---|
| `concurrency` | `number` | `1` |
| `signal` | `AbortSignal` | — — aborting cancels all *pending* tasks; running tasks are not interrupted |

### `q.add(fn, opts?): Promise<T>`

| Option | Type | Default |
|---|---|---|
| `priority` | `number` | `0` — higher served first; FIFO within equal priority |
| `signal` | `AbortSignal` | per-task; aborts only this task and only if it's still waiting |

### Other methods / props

- `q.size` — pending tasks waiting
- `q.pending` — tasks currently running
- `q.inFlight` — both combined
- `q.onIdle(): Promise<void>` — resolves when both reach 0
- `q.clear()` — drop waiting tasks (their promises reject)

## Caveats

- **Aborting a queue doesn't kill running tasks** — only refuses to schedule new ones and rejects waiting tasks. To kill a running task, pass its own signal to the underlying operation.
- **No retry built in** — combine with [@p-vbordei/pretry](https://github.com/p-vbordei/pretry) inside the task function.
- **In-memory only.** For a persistent queue across restarts, use a real job queue (BullMQ, etc.).

## License

Apache-2.0 © Vlad Bordei
