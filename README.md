# pqueue-tiny

[![ci](https://github.com/p-vbordei/pqueue-tiny/actions/workflows/ci.yml/badge.svg)](https://github.com/p-vbordei/pqueue-tiny/actions/workflows/ci.yml)

[![npm](https://img.shields.io/npm/v/pqueue-tiny.svg)](https://www.npmjs.com/package/pqueue-tiny)
[![downloads](https://img.shields.io/npm/dm/pqueue-tiny.svg)](https://www.npmjs.com/package/pqueue-tiny)
[![bundle](https://img.shields.io/bundlejs/size/pqueue-tiny)](https://bundlejs.com/?q=pqueue-tiny)

A tiny concurrency-limited promise queue with priorities, `AbortSignal` support, and an `onIdle()` awaitable. Zero dependencies.

```ts
import { PQueue } from "pqueue-tiny";

const q = new PQueue({ concurrency: 5 });

// Add tasks; they're scheduled as slots free up
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

## When to use this vs `p-queue`

`p-queue` is excellent but bigger and has lots of options you usually don't need. `pqueue-tiny` is ~150 lines and covers ~90% of real use cases.

## License

Apache-2.0 © Vlad Bordei
