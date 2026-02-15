# faultier

Structured, type-safe fault handling for TypeScript.

Faultier v2 focuses on a small API:

- `Fault` (base class)
- `Tagged` (tagged subclass factory)
- `registry` (create scoped fault registries)
- `merge` (combine registries)
- `fromSerializable` / `.toSerializable()` (wire format)

## Installation

```bash
bun add faultier
```

Or with npm/pnpm/yarn:

```bash
npm install faultier
```

## Quick Start

```ts
import * as Faultier from "faultier"

class NotFoundError extends Faultier.Tagged("NotFoundError")<{
  resource: string
  id: string
}>() {}

class TimeoutError extends Faultier.Tagged("TimeoutError")() {}

const AppFault = Faultier.registry({
  NotFoundError,
  TimeoutError,
})

const error = AppFault.create("NotFoundError", {
  resource: "user",
  id: "123",
}).withDescription("User not found", "Lookup failed after retries")
```

## Core Concepts

### 1) `Fault`

`Fault` is the abstract base class for all fault types.

**Fields:**

- `message` — user-facing message ("what happened")
- `details` — technical/diagnostic context for developers and logs

**Setters (fluent, returns `this`):**

- `withMessage(message)` — set message
- `withDetails(details)` — set details
- `withDescription(message, details?)` — convenience for both; message is always set, details only when provided
- `withMeta(meta)` — set structured metadata (merges with existing)
- `withCause(cause)` — chain a cause

**Chain methods:**

- `unwrap()` — raw cause chain as an array `[head, ..., leaf]`
- `getTags()` — `_tag` values from all Faults in the chain
- `getContext()` — merged metadata from all Faults in the chain (head wins on key conflicts)
- `flatten(options?)` — configurable chain-to-string (see below)

**Serialization:**

- `toSerializable()` — serialize to wire format

### 2) `Tagged(tag)`

Create strongly typed fault subclasses with `_tag` as discriminant.

```ts
class ValidationError extends Faultier.Tagged("ValidationError")<{
  field: string
}>() {}

const e = new ValidationError({ field: "email" })
```

### 3) `registry({ ...ctors })`

Registries give you a scoped API for a union of fault types.

```ts
const AuthFault = Faultier.registry({ NotFoundError, TimeoutError })

const wrapped = AuthFault.wrap(new Error("connection reset")).as("TimeoutError")

const result = AuthFault.matchTag(
  wrapped,
  "TimeoutError",
  () => "retry",
  () => "ignore"
)
```

### 4) `merge(a, b, ...rest)`

Merge registries into one larger union.

```ts
const AppFault = Faultier.merge(AuthFault, BillingFault)
```

Conflicting duplicate tags (same tag, different constructor) throw `RegistryMergeConflictError`.

## Cause Chains (Head -> Leaf)

Chains always traverse from latest fault (`head`) to root cause (`leaf`).

```ts
const root = new Error("db down")
const inner = new TimeoutError()
  .withDescription("Service unavailable", "Upstream timeout after 30s")
  .withCause(root)
const outer = new NotFoundError({ resource: "user", id: "123" })
  .withDescription("User not found", "Lookup failed after retries")
  .withCause(inner)

outer.unwrap() // [outer, inner, root]
outer.getTags() // ["NotFoundError", "TimeoutError"]
```

## `flatten()`

`flatten()` converts a cause chain to a string. It supports a `field` option to choose which field to collect.

```ts
// User-facing message chain (default)
outer.flatten()
// "User not found -> Service unavailable -> db down"

// Technical details chain (Fault nodes only, skips faults without details)
outer.flatten({ field: "details" })
// "Lookup failed after retries -> Upstream timeout after 30s"

// Custom separator and formatter
outer.flatten({
  field: "details",
  separator: " | ",
  formatter: (v) => v.toUpperCase(),
})
// "LOOKUP FAILED AFTER RETRIES | UPSTREAM TIMEOUT AFTER 30S"
```

**Options:**

| Option      | Type                        | Default     | Description                           |
| ----------- | --------------------------- | ----------- | ------------------------------------- |
| `field`     | `"message" \| "details"`    | `"message"` | Which field to collect from the chain |
| `separator` | `string`                    | `" -> "`    | Join separator between values         |
| `formatter` | `(value: string) => string` | trim        | Transform each value before joining   |

When `field` is `"message"` (default), non-Fault nodes in the chain are included (via `Error.message` or string coercion). Consecutive duplicate values are deduplicated.

When `field` is `"details"`, only Fault nodes with a defined `details` field are included.

## Serialization

`Fault` instances serialize to a plain object with `__faultier: true`.

```ts
const json = outer.toSerializable()

// Generic reconstruction (no subclass restoration)
const generic = Faultier.fromSerializable(json)

// Registry reconstruction (restores registered subclasses)
const restored = AuthFault.fromSerializable(json)
```

`registry.toSerializable(err)` supports:

- Fault instances
- native `Error`
- non-Error thrown values (serialized as `UnknownThrown`)

## API Surface

Runtime exports:

- `Fault`
- `Tagged`
- `registry`
- `merge`
- `isFault`
- `fromSerializable`
- `ReservedFieldError`
- `RegistryTagMismatchError`
- `RegistryMergeConflictError`

Type exports:

- `FaultRegistry`
- `FlattenOptions`
- `FlattenField`
- `SerializableFault`
- `SerializableCause`

## Notes

- `isFault` uses `instanceof`, so it is not cross-realm safe.
- Reserved constructor field names in `Tagged` throw `ReservedFieldError`.
- Cause chains are capped at 100 levels (`MAX_CAUSE_DEPTH`) in traversal, serialization, and deserialization to prevent stack overflow.
- Faultier has zero runtime dependencies.
