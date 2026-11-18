# Errors and async work

## Contents

- [Typed failures](#typed-failures)
- [Narrow caught values](#narrow-caught-values)
- [Promise ownership](#promise-ownership)
- [Await inside cleanup scopes](#await-inside-cleanup-scopes)
- [Sequence and concurrency](#sequence-and-concurrency)
- [Cancellation and lifetime conventions](#cancellation-and-lifetime-conventions)

## Typed failures

Follow the project's error model. TypeScript does not encode a function's thrown/rejected type
in its return signature. Document meaningful failure contracts, or use an established result
union for outcomes callers must handle as data.

```ts
type LookupResult =
  | { status: "found"; value: string }
  | { status: "missing" }
  | { status: "unavailable"; retryAfterMs: number };

export function lookupLabel(result: LookupResult): string {
  switch (result.status) {
    case "found":
      return result.value;
    case "missing":
      return "No record";
    case "unavailable":
      return `Retry after ${result.retryAfterMs} ms`;
  }
}
```

Use the host's provided error types at framework boundaries. Internally, distinguish stable
machine-readable codes from human messages. Codes belong in a documented serialized error
format when crossing RPC/process boundaries; `instanceof` depends on identity/prototype and is
not a wire protocol.

Where the runtime supports error causes, preserve the original error when adding context:

```ts
export class ConfigurationError extends Error {
  readonly code = "INVALID_CONFIGURATION";

  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "ConfigurationError";
  }
}
```

Check that the target supports `ErrorOptions`. Error causes and attached metadata may contain
credentials or personal data; a safe public message does not make arbitrary error serialization
safe. Use the project's approved structured fields and redaction policy.

## Narrow caught values

JavaScript permits throwing any value. With `useUnknownInCatchVariables`, narrow before
accessing fields. Prefer a provider's documented guard when matching provider failures.

```ts
export function hasErrorCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
```

Checking only `'code' in error` does not prove the field is a string. Use code/status for
programmatic recovery rather than comparing a message. Preserve existing typed error variants
when translating; blanket conversion to a generic failure can erase caller-visible semantics.

## Promise ownership

Await a promise, return it to a caller, or give a documented background owner its rejection and
lifetime handling. An `async` callback supplied to a synchronous `forEach` or event API does not
make that API await the work.

```ts
export async function saveInOrder(
  rows: readonly string[],
  save: (row: string) => Promise<void>,
): Promise<void> {
  for (const row of rows) {
    await save(row);
  }
}
```

`void promise` only discards the value; it does not catch a rejection. If background work is
already part of the host contract, attach the host's nonthrowing error sink and lifecycle owner.
A `.catch` callback that throws or returns a rejecting promise creates another rejection.
Likewise, `await rows.map(save)` awaits the array itself; it does not await its element promises.

## Await inside cleanup scopes

Returning a bare promise from a `try` can leave `finally` before the operation settles.
Keep `await` when cleanup must happen after that operation:

```ts
interface Lease {
  release(): void;
}

export async function withLease<T>(lease: Lease, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } finally {
    lease.release();
  }
}
```

Here `release` is assumed to be synchronous and nonthrowing. If disposal can reject or throw,
use the adopted policy for preserving the operation error and recording or aggregating cleanup
failure. An exception from `finally` can replace the original result/error. The syntax does not
choose error priority. Use supported explicit resource-management syntax only where the
compiler, emitted helpers and runtime contract allow it.

## Sequence and concurrency

Use sequencing for dependency order and shared mutation. Independent finite work may use
`Promise.all` when fail-fast aggregate rejection is the intended contract:

```ts
export async function readTogether<T>(
  keys: readonly string[],
  read: (key: string) => Promise<T>,
): Promise<T[]> {
  return Promise.all(keys.map(read));
}
```

`Promise.all` preserves result order, but does not stop the remaining operations when one
rejects. It does not provide transactions, cancellation or rollback. `Promise.allSettled`
collects every outcome; callers still need to interpret failures. Large or unbounded input
requires the project's concurrency/backpressure facility rather than starting all work at once.
Do not replace an ordered mutation loop with concurrency as a mechanical style change.

## Cancellation and lifetime conventions

Follow `AbortSignal` where the chosen platform/API supports it. Pass the signal through to
cancellable operations; checking it once before work starts is not ongoing cancellation.
`Promise.race` with a timeout does not cancel the losing operation. Cleanup must account for
timers, listeners and resources still active after the caller stops waiting.

Model state at its actual lifetime: per operation, request, component or application. Async
initialization can use a shared promise when one result should be reused; a cached rejected
promise also needs the project's explicit retry/reset semantics. Keep receiver binding intact
when passing methods as callbacks. TypeScript's acceptance of a callback is not proof that
the host awaits it or preserves its receiver.
