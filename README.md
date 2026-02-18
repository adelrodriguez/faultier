<div align="center">
  <h1 align="center">🦥 faultier</h1>

  <p align="center">
    <strong>Structured, type-safe fault handling for TypeScript</strong>
  </p>

  <p align="center">
    <a href="https://www.npmjs.com/package/faultier"><img src="https://img.shields.io/npm/v/faultier" alt="npm version" /></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
    <a href="https://pkg-size.dev/faultier"><img src="https://pkg-size.dev/badge/bundle/faultier" alt="Bundle size" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0+-blue.svg" alt="TypeScript" /></a>
  </p>
</div>

Faultier provides a structured way to create, classify, and handle errors with type-safe tags and structured context. Define your fault types as classes, group them in registries, and use them throughout your application with full TypeScript support for error classification and associated metadata.

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry)

<details>
<summary>Table of Contents</summary>

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Quick Start](#quick-start)
  - [Tagged Faults](#tagged-faults)
  - [Error Chaining](#error-chaining)
  - [Registries](#registries)
  - [Handling Faults](#handling-faults)
  - [Serialization](#serialization)
- [API Reference](#api-reference)
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

## Usage

### Quick Start

```ts
import * as Faultier from "faultier"

// Define fault types as tagged subclasses
class NotFoundError extends Faultier.Tagged("NotFoundError")<{
  resource: string
  id: string
}>() {}

class TimeoutError extends Faultier.Tagged("TimeoutError")() {}

// Group them into a registry
const AppFault = Faultier.registry({
  NotFoundError,
  TimeoutError,
})

// Create faults through the registry
const error = AppFault.create("NotFoundError", {
  resource: "user",
  id: "123",
}).withDescription("User not found", "Lookup failed after retries")

// Or wrap existing errors
const wrapped = AppFault.wrap(new Error("connection reset")).as("TimeoutError")
```

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

outer.unwrap()  // [outer, inner, root] — full chain as array
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

### `Fault`

The abstract base class for all fault types.

**Fields:**

- `message` — user-facing message ("what happened")
- `details` — technical/diagnostic context for developers and logs

**Setters (fluent, returns `this`):**

- `withMessage(message)` — set user-facing message
- `withDetails(details)` — set technical details
- `withDescription(message, details?)` — convenience for both; message is always set, details only when provided
- `withMeta(meta)` — set structured metadata (merges with existing)
- `withCause(cause)` — chain a cause

**Chain methods:**

- `unwrap()` — raw cause chain as an array `[head, ..., leaf]`
- `getTags()` — `_tag` values from all Faults in the chain
- `getContext()` — merged metadata from all Faults in the chain (head wins on key conflicts)
- `flatten(options?)` — configurable chain-to-string

**Serialization:**

- `toSerializable()` — serialize to wire format

### `Tagged(tag)`

Creates a strongly typed fault subclass factory with `_tag` as discriminant.

```ts
class MyError extends Faultier.Tagged("MyError")<{ code: number }>() {}
```

### `registry({ ...ctors })`

Creates a scoped fault registry from a set of tagged constructors.

**Methods:**

- `create(tag, fields?)` — create a fault by tag
- `wrap(error).as(tag, fields?)` — wrap an existing error as a tagged fault
- `matchTag(error, tag, onMatch, onElse)` — single tag matching
- `matchTags(error, handlers)` — multiple tag matching
- `fromSerializable(data)` — reconstruct a fault from serialized data (restores registered subclasses)
- `toSerializable(error)` — serialize any error (Fault, Error, or unknown thrown value)

### `merge(a, b, ...rest)`

Merges registries into one larger union. Throws `RegistryMergeConflictError` on duplicate tags with different constructors.

### `isFault(value)`

Type guard to check if a value is a `Fault` instance. Uses `instanceof`, so it is not cross-realm safe.

### `fromSerializable(data)`

Reconstructs a generic `Fault` from serialized data (no subclass restoration).

### `flatten()` Options

| Option      | Type                        | Default     | Description                           |
| ----------- | --------------------------- | ----------- | ------------------------------------- |
| `field`     | `"message" \| "details"`    | `"message"` | Which field to collect from the chain |
| `separator` | `string`                    | `" -> "`    | Join separator between values         |
| `formatter` | `(value: string) => string` | trim        | Transform each value before joining   |

When `field` is `"message"` (default), non-Fault nodes in the chain are included (via `Error.message` or string coercion). Consecutive duplicate values are deduplicated.

When `field` is `"details"`, only Fault nodes with a defined `details` field are included.

### Runtime Exports

`Fault`, `Tagged`, `registry`, `merge`, `isFault`, `fromSerializable`, `ReservedFieldError`, `RegistryTagMismatchError`, `RegistryMergeConflictError`

### Type Exports

`FaultRegistry`, `FlattenOptions`, `FlattenField`, `SerializableFault`, `SerializableCause`

## Notes

- Cause chains are capped at 100 levels (`MAX_CAUSE_DEPTH`) in traversal, serialization, and deserialization to prevent stack overflow.
- Reserved constructor field names in `Tagged` throw `ReservedFieldError`.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Acknowledgments

This project is inspired by the [Fault](https://github.com/Southclaws/fault) library.

## License

[MIT](LICENSE)
