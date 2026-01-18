<div align="center">
  <h1 align="center">🦥 faultier</h1>

  <p align="center">
    <strong>Extensible error handling for TypeScript</strong>
  </p>

  <p align="center">
    <a href="https://www.npmjs.com/package/faultier"><img src="https://img.shields.io/npm/v/faultier" alt="npm version" /></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0+-blue.svg" alt="TypeScript" /></a>
  </p>
</div>

Faultier provides a structured way to create, wrap, and handle errors with type-safe tags and context. Define your error types in one place, then use them throughout your application with full TypeScript support for error classification and associated metadata.

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry)

<details>
<summary>Table of Contents</summary>

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Quick Start](#quick-start)
  - [Type Safety](#type-safety)
  - [Error Chaining](#error-chaining)
  - [Handling Faults](#handling-faults)
  - [Custom Methods](#custom-methods)
- [API Reference](#api-reference)
- [Contributing](#contributing)
- [Acknowledgments](#acknowledgments)
- [License](#license)

</details>

## Features

- **Type-safe tags** - Define error tags and get autocomplete and type checking
- **Typed context** - Associate structured metadata with each error type
- **Dual messages** - Separate debug messages for logs from user-facing messages
- **Error chaining** - Wrap and re-throw errors while preserving the full chain
- **Serializable** - Convert faults to JSON and reconstruct them
- **Instanceof support** - Use `instanceof` checks with your custom Fault class
- **Extensible** - Add custom methods to your Fault class
- **No dependencies** - Zero runtime dependencies

## Installation

```bash
# npm
npm install faultier

# yarn
yarn add faultier

# pnpm
pnpm add faultier

# bun
bun add faultier
```

## Usage

### Quick Start

```ts
import Faultier from "faultier"

// Define your error registry
type AppErrors = {
  DATABASE_ERROR: { query: string; host?: string }
  AUTH_ERROR: { userId: string; reason: string }
  NOT_FOUND: { resource: string; id: string }
  VALIDATION_ERROR: { field?: string; message?: string }
  GENERIC_ERROR: never // No context allowed
}

// Create your typed Fault class
export class Fault extends Faultier.define<AppErrors>() {}

// Wrap an existing error and add classification
try {
  await database.query()
} catch (err) {
  throw Fault.wrap(err) // Wrap any error as a Fault
    .withTag("DATABASE_ERROR", { query: "SELECT * FROM users" }) // Tag + context together
}

// Or create a fault directly when you control the error
throw Fault.create("NOT_FOUND", { resource: "user", id: "123" })

// Context is optional when all properties are optional
throw Fault.create("VALIDATION_ERROR").withDescription("Invalid input")

// Separate debug info from user-facing messages
throw Fault.wrap(err)
  .withTag("DATABASE_ERROR", { query: "SELECT *" })
  .withMeta({ traceId: "trace-123" }) // Metadata
  .withDescription(
    "Stripe API error 402: card_declined (insufficient_funds)", // Debug (for logs)
    "Payment failed. Please try a different card." // User-facing message
  )
```

### Type Safety

Define your error registry as a TypeScript type, then create your Fault class:

```ts
import Faultier from "faultier"

// Define your error registry
type AppErrors = {
  DATABASE_ERROR: { query: string; host?: string }
  AUTH_ERROR: { userId: string; reason: string }
  NOT_FOUND: { resource: string; id: string }
  VALIDATION_ERROR: { field: string; message: string }
  GENERIC_ERROR: never // No context allowed - withContext will error
}

// Create your typed Fault class
export class Fault extends Faultier.define<AppErrors>() {}
```

Now TypeScript enforces correct tag/context combinations:

```ts
// Required context: DATABASE_ERROR has required `query` property
Fault.create("DATABASE_ERROR", { query: "SELECT *" }) // OK - context required
Fault.create("DATABASE_ERROR") // Type error: context is required

// Optional context: VALIDATION_ERROR has all optional properties
Fault.create("VALIDATION_ERROR") // OK - context is optional
Fault.create("VALIDATION_ERROR", { field: "email" }) // OK

// No context: GENERIC_ERROR is `never`
Fault.create("GENERIC_ERROR") // OK - no context allowed
```

#### Clean return types for tagged faults

When you want to annotate function return types (or public API surfaces), use the helper type:
`Tagged<typeof Fault, "TAG">`.

```ts
import Faultier, { type Tagged, type Tags } from "faultier"

type AppErrors = {
  DATABASE_ERROR: { query: string; host?: string }
  GENERIC_ERROR: never
}

export class Fault extends Faultier.define<AppErrors>() {}

export function runQuery(): Tagged<typeof Fault, "DATABASE_ERROR"> {
  return Fault.create("DATABASE_ERROR", { query: "SELECT 1" })
}

// You can also extract the full tag union for a given Fault class:
export type FaultTag = Tags<typeof Fault>
```

When checking a fault's tag, TypeScript narrows the context type:

```ts
const fault = Fault.create("DATABASE_ERROR", { query: "SELECT *" })

if (fault.tag === "DATABASE_ERROR") {
  // TypeScript knows fault.context is { query: string; host?: string }
  console.log(fault.context?.query) // Use optional chaining since context may be undefined
}
```

Note: Context defaults to `undefined` when not provided. For tags with all optional properties, context can be omitted entirely.

For larger applications with many error types, you can organize them into groups:

```ts
// Group related errors together
type DatabaseErrors = {
  DB_CONNECTION_ERROR: { host: string; port: number }
  DB_QUERY_ERROR: { query: string; table: string }
  DB_TIMEOUT_ERROR: { timeout: number }
}

type AuthErrors = {
  AUTH_INVALID_TOKEN: { token: string; reason: string }
  AUTH_EXPIRED_SESSION: { sessionId: string }
  AUTH_INSUFFICIENT_PERMISSIONS: { userId: string; required: string[] }
}

type ValidationErrors = {
  VALIDATION_FAILED: { field: string; message: string }
  VALIDATION_SCHEMA_ERROR: { errors: string[] }
}

// Combine all error types in your registry
type AppErrors = DatabaseErrors &
  AuthErrors &
  ValidationErrors & {
    GENERIC_ERROR: never
  }

// Create your typed Fault class
export class Fault extends Faultier.define<AppErrors>() {}
```

### Error Chaining

Faults preserve the full error chain:

```ts
try {
  await fetchUser()
} catch (err) {
  throw Fault.wrap(err).withTag("SERVICE_ERROR").withDescription(
    "User service failed on primary endpoint", // Debug message
    "Unable to load user data" // User-facing message
  )
}
```

Extract information from the chain:

```ts
const fault = Fault.wrap(originalError).withTag("API_ERROR", { endpoint: "/users" })

fault.unwrap() // [fault, ...causes, originalError] - full chain as array
fault.flatten() // "API failed -> Service error -> Connection timeout" - messages joined
fault.getTags() // ["API_ERROR", "SERVICE_ERROR", "DB_ERROR"] - all tags in chain
fault.getFullContext() // { endpoint: "/users", host: "..." } - merged context from all faults
fault.getFullMeta() // { traceId: "..." } - merged meta from all faults
```

### Handling Faults

#### Single Tag Matching

Use `Fault.matchTag` when you only need to handle one specific fault type:

```ts
const result = Fault.matchTag(error, "DATABASE_ERROR", (fault) => {
  logger.error("DB error", fault.context.query)
  return { status: 500 }
})

if (Fault.isUnknown(result)) {
  // Not a fault or different tag
}
```

#### Multiple Tag Matching

Use `Fault.matchTags` to handle several fault types:

```ts
const result = Fault.matchTags(error, {
  NOT_FOUND: (fault) => ({ status: 404 }),
  AUTH_ERROR: (fault) => ({ status: 401 }),
})

if (Fault.isUnknown(result)) {
  // Not a fault or unhandled tag
}
```

#### Global Error Handling

Use `Fault.handle` in global error handlers where you need to handle
every possible fault type. It requires handlers for ALL registered tags:

```ts
const result = Fault.handle(error, {
  DATABASE_ERROR: (fault) => {
    logger.error("DB error", fault.context.query)
    return { status: 500 }
  },
  NOT_FOUND: (fault) => {
    return { status: 404, resource: fault.context.resource }
  },
  AUTH_ERROR: (fault) => {
    return { status: 401, reason: fault.context.reason }
  },
  // ... all registered tags
})

if (Fault.isUnknown(result)) {
  // Error is not a Fault
  throw error
}

return result // { status: 404, resource: "user" }
```

### Custom Methods

You can extend your Fault class with custom methods:

```ts
import Faultier from "faultier"

type AppErrors = {
  "db.connection_failed": { host: string }
  "db.timeout": { timeoutMs: number }
  "auth.unauthenticated": { requestId?: string }
  "validation.failed": { field: string }
}

export class Fault extends Faultier.define<AppErrors>() {
  // Add custom instance methods
  isRetryable(): boolean {
    return ["db.connection_failed", "db.timeout"].includes(this.tag)
  }

  toHttpStatus(): number {
    const statusMap: Record<string, number> = {
      "auth.unauthenticated": 401,
      "validation.failed": 400,
      "db.connection_failed": 503,
      "db.timeout": 504,
    }
    return statusMap[this.tag] ?? 500
  }

  // Add custom static methods
  static isRetryableError(error: unknown): boolean {
    if (!Fault.isFault(error)) return false
    return error.isRetryable()
  }
}

// Usage
const fault = Fault.create("db.timeout", { timeoutMs: 5000 })
if (fault.isRetryable()) {
  // Retry logic
}

// instanceof works!
if (error instanceof Fault) {
  console.log(error.tag)
  console.log(error.isRetryable())
}
```

**Note:** Chaining methods (`withTag`, `withDescription`, etc.) are immutable - they return new instances. `withMeta` is the exception and mutates the same instance. This means you can safely reuse intermediate results:

```ts
const base = Fault.create("db.timeout")
const fault1 = base.withDescription("Error 1")
const fault2 = base.withDescription("Error 2")

// Each is a separate instance - base is unchanged
expect(fault1.debug).toBe("Error 1")
expect(fault2.debug).toBe("Error 2")
expect(base.debug).toBeUndefined()
```

## API Reference

### Creating Your Fault Class

#### `Faultier.define<TRegistry>()`

Creates a typed Fault class based on your registry type.

```ts
import Faultier from "faultier"

type MyRegistry = {
  MY_ERROR: { code: number }
}

class Fault extends Faultier.define<MyRegistry>() {}
```

### Static Methods

#### `Fault.wrap(error)`

Wraps any error into a Fault instance.

```ts
Fault.wrap(new Error("Something failed")).withTag("INTERNAL_ERROR", { operation: "sync" })
```

#### `Fault.create(tag, context?)`

Creates a new Fault with the specified tag and context. Context is required if the registry has required properties for this tag.

```ts
// Required context
Fault.create("VALIDATION_ERROR", { field: "email", message: "Invalid format" })

// Optional context (when all properties are optional)
Fault.create("GENERIC_ERROR")
```

#### `Fault.isFault(value)`

Type guard to check if a value is a Fault.

```ts
try {
  await riskyOperation()
} catch (error) {
  if (Fault.isFault(error)) {
    console.log(error.tag) // Type-safe access
    console.log(error.context) // Type-safe access
  }
}
```

#### `Fault.toSerializable(fault)`

Converts a fault and its entire error chain to a plain object for serialization.

```ts
const fault = Fault.create("API_ERROR", { endpoint: "/users" })
  .withMeta({ traceId: "trace-123" })
  .withDescription("Request failed")

const serialized = Fault.toSerializable(fault)
// {
//   name: "Fault",
//   tag: "API_ERROR",
//   message: "Request failed",
//   context: { endpoint: "/users" },
//   meta: { traceId: "trace-123" },
//   cause: { name: "Error", message: "Connection timeout" }
// }

// Send over network, store in database, etc.
await redis.set("last-error", JSON.stringify(serialized))
```

#### `Fault.fromSerializable(data)`

Reconstructs a Fault from serialized data, preserving the full error chain.

```ts
const data = await redis.get("last-error")
const fault = Fault.fromSerializable(JSON.parse(data))

console.log(fault.tag) // "API_ERROR"
console.log(fault.unwrap()) // Full chain restored
```

#### `Fault.getIssue(fault, options?)`

Extracts and joins user-facing messages from all faults in the chain.

```ts
const fault = Fault.wrap(dbError)
  .withTag("SERVICE_ERROR")
  .withDescription("DB failed", "Service unavailable")

Fault.getIssue(fault)
// "Service unavailable. Database connection failed."

Fault.getIssue(fault, { separator: " | " })
// "Service unavailable. | Database connection failed."
```

#### `Fault.getDebug(fault, options?)`

Extracts and joins debug messages from all faults in the chain.

```ts
const fault = Fault.wrap(dbError)
  .withTag("SERVICE_ERROR")
  .withDescription("Connection to postgres:5432 timed out after 30s")

Fault.getDebug(fault)
// "Connection to postgres:5432 timed out after 30s."

Fault.getDebug(fault, { separator: " -> " })
// "Connection to postgres:5432 timed out after 30s. -> Original DB error."
```

#### `Fault.matchTag(error, tag, callback)`

Matches a fault against a single tag. Runs the callback only if the error is a fault with the specified tag.

```ts
const result = Fault.matchTag(error, "DATABASE_ERROR", (fault) => {
  logger.error("DB error", { query: fault.context.query })
  return { status: 500 }
})

if (Fault.isUnknown(result)) {
  // Not a fault or different tag
}
```

#### `Fault.matchTags(error, handlers)`

Matches a fault against multiple tags. Runs the matching handler if the error is a fault with one of the specified tags. Unlike `handle`, only requires handlers for the tags you want to match.

```ts
const result = Fault.matchTags(error, {
  NOT_FOUND: (fault) => {
    return { status: 404, resource: fault.context.resource }
  },
  DB_ERROR: (fault) => {
    logger.error("DB error", { query: fault.context.query })
    return { status: 500 }
  },
})

if (Fault.isUnknown(result)) {
  // Not a fault or unhandled tag
}
```

#### `Fault.handle(error, handlers)`

Exhaustively dispatches a fault to handlers for all registered tags. Use this in global error handlers where you need to handle every possible fault type. For partial matching, use `matchTag` or `matchTags` instead.

```ts
const result = Fault.handle(error, {
  DATABASE_ERROR: (fault) => {
    logger.error("DB error", { query: fault.context.query })
    return { status: 500, message: "Database error" }
  },
  NOT_FOUND: (fault) => {
    return { status: 404, resource: fault.context.resource }
  },
  AUTH_ERROR: (fault) => {
    return { status: 401, reason: fault.context.reason }
  },
  // ... all registered tags
})

if (Fault.isUnknown(result)) {
  // Error is not a Fault
  throw error
}

return result // { status: 404, resource: "user" }
```

#### `Fault.isUnknown(value)`

Checks if a match result is UNKNOWN (not a fault or no handler matched). Use this to check the result of `matchTag`, `matchTags`, or `handle`.

```ts
const result = Fault.matchTags(error, {
  NOT_FOUND: (fault) => ({ status: 404 }),
})

if (Fault.isUnknown(result)) {
  // Not a fault or unhandled tag
  throw error
}

// result is typed as { status: number } here
```

#### `Fault.assert(error)`

Asserts that an error is a Fault, re-throwing if it's not.

```ts
try {
  await riskyOperation()
} catch (error) {
  Fault.assert(error) // Throws if not a Fault

  // TypeScript now knows error is a Fault
  console.log(error.tag)
  console.log(error.context)
}
```

#### `Fault.findCause(error, ErrorClass)`

Searches the error chain for a cause matching the given Error class. Returns the first matching error, or undefined if not found.

```ts
class HttpError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message)
  }
}

const httpError = Fault.findCause(error, HttpError)
if (httpError) {
  console.log(httpError.statusCode) // Fully typed!
}
```

### Instance Methods

#### `fault.withTag(tag, context?)`

Sets the tag and context for this fault. Context is required if the registry has required properties for this tag. Returns a tagged fault for chaining.

#### `fault.withDescription(debug, message?)`

Sets debug and optional user-facing messages. Returns `this` for chaining.

#### `fault.withDebug(debug)`

Sets only the debug message (for developers/logs). Returns `this` for chaining.

#### `fault.withMeta(meta)`

Merges metadata into the fault. Mutates and returns the same instance.

#### `fault.withMessage(message)`

Sets only the user-facing message (overrides the original error message). Returns `this` for chaining.

#### `fault.unwrap()`

Returns the full error chain as an array.

#### `fault.flatten(options?)`

Flattens all messages into a single string.

#### `fault.getTags()`

Returns all tags from faults in the chain.

#### `fault.getFullContext()`

Returns merged context from all faults in the chain.

#### `fault.getFullMeta()`

Returns merged meta from all faults in the chain.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Acknowledgments

This project is inspired by the [Fault](https://github.com/Southclaws/fault) library.

## License

[MIT](LICENSE)
