![Faultier Banner](./assets/banner.webp)

<div align="center">
  <h1 align="center">🦥 faultier</h1>

  <p align="center">
    <strong>Structured, extensible, type-safe error handling for TypeScript</strong>
  </p>

  <p align="center">
    <a href="https://www.npmjs.com/package/faultier"><img src="https://img.shields.io/npm/v/faultier" alt="npm version" /></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  </p>
</div>

Create, classify, and extend errors with type-safe tags and structured context. Define your fault types as classes, group them in registries, and use them throughout your application with full TypeScript support for error classification and associated metadata.

```ts
import * as Faultier from "faultier"

class NotFoundError extends Faultier.Tagged("NotFoundError")<{ id: string }>() {}
const fault = new NotFoundError({ id: "123" }).withDescription(
  "User not found",
  "DB query returned 0 rows"
)
fault._tag // "NotFoundError"
fault.id // "123"
fault.message // "User not found"           — user-facing
fault.details // "DB query returned 0 rows" — for logs
```

<details>
<summary>Table of Contents</summary>

- [Features](#features)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Tagged Faults](#tagged-faults)
  - [Error Chaining](#error-chaining)
  - [Registries](#registries)
  - [Handling Faults](#handling-faults)
  - [Serialization](#serialization)
- [API Reference](#api-reference)
- [Common Recipes](#common-recipes)
- [When not to use Faultier](#when-not-to-use-faultier)
- [Contributing](#contributing)
- [Acknowledgments](#acknowledgments)
- [License](#license)

</details>

## Features

- **Tagged subclasses** — Define fault types as real classes with `_tag` discriminants
- **Typed context** — Associate structured fields with each fault type
- **Dual messages** — Separate `details` for logs from user-facing `message`
- **Error chaining** — Wrap and re-throw errors while preserving the full cause chain
- **Registries** — Group fault types into scoped unions with `create`, `wrap`, and `match` APIs
- **Serializable** — Convert faults to wire format and reconstruct them
- **Instanceof support** — Use `instanceof` checks with your fault subclasses
- **No dependencies** — Zero runtime dependencies

## Installation

```bash
# bun
bun add faultier

# npm
npm install faultier

# yarn
yarn add faultier

# pnpm
pnpm add faultier
```

## Core Concepts

| Term         | Meaning                                                                           |
| ------------ | --------------------------------------------------------------------------------- |
| **Fault**    | Base error class. Every faultier error extends it.                                |
| **Tag**      | A string discriminant (`_tag`) on each fault, used for matching.                  |
| **message**  | User-facing description ("User not found").                                       |
| **details**  | Internal/diagnostic info for logs ("DB query returned 0 rows").                   |
| **meta**     | Arbitrary structured metadata (`{ traceId, requestId, ... }`).                    |
| **context**  | The merged `meta` from every fault in a cause chain (head wins on key conflicts). |
| **Registry** | A scoped group of fault classes with `create`, `wrap`, and `match` helpers.       |

Not sure if Faultier is a good fit for your project? See [When not to use Faultier](#when-not-to-use-faultier).

## Quick Start

Define tagged fault classes and throw/catch them with full type safety:

```ts
import * as Faultier from "faultier"

class NotFoundError extends Faultier.Tagged("NotFoundError")<{ id: string }>() {}
class DatabaseError extends Faultier.Tagged("DatabaseError")() {}

const AppFault = Faultier.registry({ NotFoundError, DatabaseError })

try {
  throw AppFault.create("NotFoundError", { id: "123" }).withMessage("User not found")
} catch (err) {
  AppFault.matchTags(err, {
    NotFoundError: (fault) => console.log(fault.id), // "123" — fully typed
    DatabaseError: () => console.log("db failed"),
  })
}
```

In a real application, you'd use registries to create and wrap errors across your codebase:

```ts
async function getUser(id: string) {
  let row: { id: string; name: string } | undefined

  try {
    row = await db.query("SELECT * FROM users WHERE id = ?", [id])
  } catch (err) {
    throw AppFault.wrap(err).as("DatabaseError")
  }

  if (!row) {
    throw AppFault.create("NotFoundError", { id })
  }

  return row
}
```

## Usage

### Tagged Faults

Use `Tagged(tag)` to create strongly typed fault subclasses with `_tag` as the discriminant.

```ts
import * as Faultier from "faultier"

// With typed fields
class ValidationError extends Faultier.Tagged("ValidationError")<{
  field: string
}>() {}

const e = new ValidationError({ field: "email" })

// Without fields
class TimeoutError extends Faultier.Tagged("TimeoutError")() {}

const t = new TimeoutError()
```

All tagged faults extend `Fault` and support fluent setters:

```ts
const fault = new ValidationError({ field: "email" })
  .withDescription("Invalid email format", "Validation failed for user signup")
  .withMeta({ traceId: "trace-123" })
  .withCause(originalError)
```

### Error Chaining

Faults preserve the full error chain from head (latest) to leaf (root cause):

```ts
const root = new Error("db down")
const inner = new TimeoutError()
  .withDescription("Service unavailable", "Upstream timeout after 30s")
  .withCause(root)
const outer = new NotFoundError({ resource: "user", id: "123" })
  .withDescription("User not found", "Lookup failed after retries")
  .withCause(inner)

outer.unwrap() // [outer, inner, root] — full chain as array
outer.getTags() // ["NotFoundError", "TimeoutError"] — all tags in chain
outer.getContext() // merged metadata from all faults (head wins on conflicts)
```

Use `flatten()` to convert a cause chain to a string:

```ts
outer.flatten()
// "User not found -> Service unavailable -> db down"

outer.flatten({ field: "details" })
// "Lookup failed after retries -> Upstream timeout after 30s"

outer.flatten({
  field: "details",
  separator: " | ",
  formatter: (v) => v.toUpperCase(),
})
// "LOOKUP FAILED AFTER RETRIES | UPSTREAM TIMEOUT AFTER 30S"
```

`flatten()` accepts an options object:

| Option      | Type                        | Default     | Description                           |
| ----------- | --------------------------- | ----------- | ------------------------------------- |
| `field`     | `"message" \| "details"`    | `"message"` | Which field to collect from the chain |
| `separator` | `string`                    | `" -> "`    | Join separator between values         |
| `formatter` | `(value: string) => string` | trim        | Transform each value before joining   |

When `field` is `"message"` (default), non-Fault nodes in the chain are included (via `Error.message` or string coercion). Consecutive duplicate values are deduplicated. When `field` is `"details"`, only Fault nodes with a defined `details` field are included.

### Registries

Registries give you a scoped API for a union of fault types:

```ts
const AuthFault = Faultier.registry({ NotFoundError, TimeoutError })

// Create faults by tag
const fault = AuthFault.create("NotFoundError", { resource: "user", id: "123" })

// Wrap existing errors
const wrapped = AuthFault.wrap(new Error("connection reset")).as("TimeoutError")
```

Merge registries into a larger union:

```ts
const AppFault = Faultier.merge(AuthFault, BillingFault)
```

Conflicting duplicate tags (same tag, different constructor) throw `RegistryMergeConflictError`.

### Handling Faults

#### Single Tag Matching

Use `matchTag` when you only need to handle one specific fault type:

```ts
const result = AuthFault.matchTag(
  error,
  "TimeoutError",
  () => "retry",
  () => "ignore"
)
```

#### Multiple Tag Matching

Use `matchTags` to handle several fault types:

```ts
const result = AuthFault.matchTags(error, {
  NotFoundError: (fault) => ({ status: 404 }),
  TimeoutError: (fault) => ({ status: 503 }),
})
```

### Serialization

Fault instances serialize to a plain object with `__faultier: true`:

```ts
const json = outer.toSerializable()

// Generic reconstruction (no subclass restoration)
const generic = Faultier.fromSerializable(json)

// Registry reconstruction (restores registered subclasses)
const restored = AuthFault.fromSerializable(json)
```

`registry.toSerializable(err)` supports Fault instances, native `Error`, and non-Error thrown values (serialized as `UnknownThrown`).

## API Reference

### Fault Instance

| Method                               | Description                                                   |
| ------------------------------------ | ------------------------------------------------------------- |
| `message`                            | User-facing message ("what happened")                         |
| `details`                            | Technical/diagnostic context for developers and logs          |
| `withMessage(message)`               | Set user-facing message (fluent)                              |
| `withDetails(details)`               | Set technical details (fluent)                                |
| `withDescription(message, details?)` | Set both message and details (fluent)                         |
| `withMeta(meta)`                     | Set structured metadata, merges with existing (fluent)        |
| `withCause(cause)`                   | Chain a cause (fluent)                                        |
| `unwrap()`                           | Cause chain as array `[head, ..., leaf]`                      |
| `getTags()`                          | `_tag` values from all Faults in the chain                    |
| `getContext()`                       | Merged metadata from all Faults (head wins on conflicts)      |
| `flatten(options?)`                  | Cause chain to string (see [Error Chaining](#error-chaining)) |
| `toSerializable()`                   | Serialize to wire format                                      |

### Registry

| Method                                     | Description                                                 |
| ------------------------------------------ | ----------------------------------------------------------- |
| `create(tag, fields?)`                     | Create a fault by tag                                       |
| `wrap(error).as(tag, fields?)`             | Wrap an existing error as a tagged fault                    |
| `is(error)`                                | Type guard for any fault in the registry                    |
| `matchTag(error, tag, handler, fallback?)` | Single tag matching                                         |
| `matchTags(error, handlers, fallback?)`    | Multiple tag matching                                       |
| `toSerializable(error)`                    | Serialize any error (Fault, Error, or unknown thrown value) |
| `fromSerializable(data)`                   | Reconstruct a fault, restoring registered subclasses        |

### Top-level (`Faultier.*`)

| Method                   | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `Tagged(tag)<Fields>()`  | Create a tagged Fault subclass with `_tag` as discriminant   |
| `registry({ ...ctors })` | Create a scoped fault registry from tagged constructors      |
| `merge(a, b, ...rest)`   | Merge registries into one union (throws on conflicting tags) |
| `isFault(value)`         | Type guard for Fault instances (not cross-realm safe)        |
| `fromSerializable(data)` | Reconstruct a generic Fault (no subclass restoration)        |

### Exports

**Runtime:** `Fault`, `Tagged`, `registry`, `merge`, `isFault`, `fromSerializable`, `ReservedFieldError`, `RegistryTagMismatchError`, `RegistryMergeConflictError`

**Types:** `FaultRegistry`, `FlattenOptions`, `FlattenField`, `SerializableFault`, `SerializableCause`

## Common Recipes

### Map faults to HTTP status codes

```ts
function toHttpStatus(err: unknown) {
  return AppFault.matchTags(
    err,
    {
      NotFoundError: () => 404,
      ValidationError: () => 422,
      DatabaseError: () => 503,
    },
    () => 500
  )
}
```

### Wrap unknown errors safely

```ts
try {
  await riskyOperation()
} catch (err) {
  // Wraps anything — Error instances, strings, even undefined
  throw AppFault.wrap(err).as("DatabaseError")
}
```

### Serialize across a boundary

```ts
// Server: serialize any error for the wire
const payload = AppFault.toSerializable(err)
res.json(payload)

// Client: reconstruct with subclass restoration
const fault = AppFault.fromSerializable(payload)
fault instanceof NotFoundError // true (if registered)
```

## Notes

- Cause chains are capped at 100 levels (`MAX_CAUSE_DEPTH`) in traversal, serialization, and deserialization to prevent stack overflow.
- Reserved constructor field names in `Tagged` throw `ReservedFieldError`.

## When not to use Faultier

- **Small scripts or one-off CLIs** — plain `throw new Error()` is fine when you don't need classification.
- **You already have a tagged error solution** — if your codebase already uses a library with `_tag` discriminants (e.g., Effect errors), adding Faultier would be redundant.
- **You don't want to maintain an error taxonomy** — Faultier works best when your team commits to defining and evolving a set of fault classes. If that feels like too much overhead, it probably is.
- **Very high-volume failure paths** — class instantiation per error is negligible for normal use, but may matter if errors are part of expected control flow at high frequency (e.g., validation in a tight loop).

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Acknowledgments

This project is inspired by the [Fault](https://github.com/Southclaws/fault) library.

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry)

## License

[MIT](LICENSE)
