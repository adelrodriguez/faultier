<div align="center">
  <h1 align="center">🦥 faultier</h1>

  <p align="center">
    <strong>Extensible error handling for TypeScript</strong>
  </p>

  <p align="center">
    Work in progress.
  </p>
</div>

Faultier provides a structured way to create, wrap, and handle errors with type-safe tags and context. Define your error types in one place, then use them throughout your application with full TypeScript support for error classification and associated metadata.

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry)

## Features

- **Type-safe tags** - Define error tags and get autocomplete and type checking
- **Typed context** - Associate structured metadata with each error type
- **Error chaining** - Wrap and re-throw errors while preserving the full chain
- **Extensible** - Extend existing Error classes with Fault functionality
- **Serializable** - Convert faults to JSON and reconstruct them
- **No dependencies** - Zero runtime dependencies

## Installation

```bash
npm install faultier
```

## Usage

### Quick Start

```ts
import Fault from "faultier";

// Wrap an error with a tag
try {
  await database.query();
} catch (err) {
  throw Fault.wrap(err)
    .withTag("DATABASE_ERROR")
    .withContext({ query: "SELECT * FROM users" });
}

// Create a fault directly
throw Fault.create("NOT_FOUND").withContext({ resource: "user", id: "123" });
```

### Type Safety

Define your error types using module augmentation:

```ts
declare module "faultier" {
  interface FaultRegistry {
    DATABASE_ERROR: { query: string; host?: string };
    AUTH_ERROR: { userId: string; reason: string };
    NOT_FOUND: { resource: string; id: string };
    VALIDATION_ERROR: { field: string; message: string };
    GENERIC_ERROR: never; // No context allowed - withContext will error
  }
}
```

Now TypeScript enforces correct tag/context combinations:

```ts
// Type-safe: context must match the tag
Fault.create("DATABASE_ERROR").withContext({ query: "SELECT *" }); // OK

Fault.create("DATABASE_ERROR").withContext({ userId: "123" }); // Type error: missing 'query'

Fault.create("NOT_FOUND").withContext({ resource: "user", id: "123" }); // OK

Fault.create("GENERIC_ERROR").withContext({ anything: "value" }); // Type error: withContext returns never
```

For larger applications with many error types, you can organize them into groups:

```ts
// Group related errors together
type DatabaseErrors = {
  DB_CONNECTION_ERROR: { host: string; port: number };
  DB_QUERY_ERROR: { query: string; table: string };
  DB_TIMEOUT_ERROR: { timeout: number };
};

type AuthErrors = {
  AUTH_INVALID_TOKEN: { token: string; reason: string };
  AUTH_EXPIRED_SESSION: { sessionId: string };
  AUTH_INSUFFICIENT_PERMISSIONS: { userId: string; required: string[] };
};

type ValidationErrors = {
  VALIDATION_FAILED: { field: string; message: string };
  VALIDATION_SCHEMA_ERROR: { errors: string[] };
};

// Combine all error types in your registry
declare module "faultier" {
  interface FaultRegistry extends DatabaseErrors, AuthErrors, ValidationErrors {
    // Add any standalone errors here
    GENERIC_ERROR: never;
  }
}
```

### Error Chaining

Faults preserve the full error chain:

```ts
try {
  await fetchUser();
} catch (err) {
  throw Fault.wrap(err).withTag("SERVICE_ERROR").withDescription(
    "User service failed on primary endpoint", // Debug message
    "Unable to load user data" // User-facing message
  );
}
```

Extract information from the chain:

```ts
const fault = Fault.wrap(originalError)
  .withTag("API_ERROR")
  .withContext({ endpoint: "/users" });

fault.unwrap(); // [fault, ...causes, originalError]
fault.flatten(); // "API failed -> Service error -> Connection timeout"
fault.getTags(); // ["API_ERROR", "SERVICE_ERROR", "DB_ERROR"]
fault.getFullContext(); // Merged context from all faults
```

### Handling Faults

Use `Fault.handle` to dispatch based on tag:

```ts
const result = Fault.handle(error, {
  DATABASE_ERROR: (fault) => {
    logger.error("DB error", fault.context.query);
    return { status: 500 };
  },
  NOT_FOUND: (fault) => {
    return { status: 404, resource: fault.context.resource };
  },
  AUTH_ERROR: (fault) => {
    return { status: 401 };
  },
});

if (result === Fault.UNKNOWN) {
  // Not a fault or no handler for this tag
}
```

### Extending Error Classes

Use `faultier/extend` to add Fault functionality to existing Error classes:

```ts
import { extend } from "faultier/extend";

class HttpError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

const HttpFault = extend(HttpError);

const fault = HttpFault.create("Not found", 404)
  .withTag("HTTP_ERROR")
  .withContext({ path: "/api/users" });

console.log(fault.statusCode); // 404
console.log(fault.tag); // "HTTP_ERROR"
console.log(fault.flatten()); // Works like regular Fault
```

### API Reference

### Fault

#### `Fault.wrap(error)`

Wraps any error into a Fault instance.

```ts
Fault.wrap(new Error("Something failed"))
  .withTag("INTERNAL_ERROR")
  .withContext({ operation: "sync" });
```

#### `Fault.create(tag)`

Creates a new Fault with the specified tag.

```ts
Fault.create("VALIDATION_ERROR").withContext({
  field: "email",
  message: "Invalid format",
});
```

### Instance Methods

#### `fault.withTag(tag)`

Sets the tag for a wrapped fault.

#### `fault.withContext(context)`

Sets the context for a tagged fault.

#### `fault.withDescription(debug, message?)`

Sets debug and optional user-facing messages.

#### `fault.withDebug(debug)`

Sets only the debug message (for developers/logs).

#### `fault.withMessage(message)`

Sets only the user-facing message (overrides the original error message).

#### `fault.unwrap()`

Returns the full error chain as an array.

#### `fault.flatten(options?)`

Flattens all messages into a single string.

#### `fault.getTags()`

Returns all tags from faults in the chain.

#### `fault.getFullContext()`

Returns merged context from all faults in the chain.

### Static Methods

#### `Fault.isFault(value)`

Type guard to check if a value is a Fault.

```ts
try {
  await riskyOperation();
} catch (error) {
  if (Fault.isFault(error)) {
    console.log(error.tag); // Type-safe access
    console.log(error.context); // Type-safe access
  }
}
```

#### `Fault.toSerializable(fault)`

Converts a fault and its entire error chain to a plain object for serialization.

```ts
const fault = Fault.create("API_ERROR")
  .withContext({ endpoint: "/users" })
  .withDescription("Request failed");

const serialized = Fault.toSerializable(fault);
// {
//   name: "Fault",
//   tag: "API_ERROR",
//   message: "Request failed",
//   context: { endpoint: "/users" },
//   cause: { name: "Error", message: "Connection timeout" }
// }

// Send over network, store in database, etc.
await redis.set("last-error", JSON.stringify(serialized));
```

#### `Fault.fromSerializable(data)`

Reconstructs a Fault from serialized data, preserving the full error chain.

```ts
const data = await redis.get("last-error");
const fault = Fault.fromSerializable(JSON.parse(data));

console.log(fault.tag); // "API_ERROR"
console.log(fault.unwrap()); // Full chain restored
```

#### `Fault.getIssue(fault, options?)`

Extracts and joins user-facing messages from all faults in the chain.

```ts
const fault = Fault.wrap(dbError)
  .withTag("SERVICE_ERROR")
  .withDescription("DB failed", "Service unavailable");

Fault.getIssue(fault);
// "Service unavailable. Database connection failed."

Fault.getIssue(fault, { separator: " | " });
// "Service unavailable. | Database connection failed."
```

#### `Fault.getDebug(fault, options?)`

Extracts and joins debug messages from all faults in the chain.

```ts
const fault = Fault.wrap(dbError)
  .withTag("SERVICE_ERROR")
  .withDescription("Connection to postgres:5432 timed out after 30s");

Fault.getDebug(fault);
// "Connection to postgres:5432 timed out after 30s."

Fault.getDebug(fault, { separator: " -> " });
// "Connection to postgres:5432 timed out after 30s. -> Original DB error."
```

#### `Fault.handle(error, handlers)`

Dispatches a fault to the handler matching its tag. Returns `UNKNOWN` if the error is not a Fault or has no matching handler.

```ts
import Fault, { UNKNOWN } from "faultier";

const result = Fault.handle(error, {
  DATABASE_ERROR: (fault) => {
    logger.error("DB error", { query: fault.context.query });
    return { status: 500, message: "Database error" };
  },
  NOT_FOUND: (fault) => {
    return { status: 404, resource: fault.context.resource };
  },
  AUTH_ERROR: (fault) => {
    return { status: 401, reason: fault.context.reason };
  },
});

if (result === UNKNOWN) {
  // Error is not a Fault, or no handler matched the tag
  throw error;
}

return result; // { status: 404, resource: "user" }
```

#### `Fault.assert(error)`

Asserts that an error is a Fault, re-throwing if it's not.

```ts
try {
  await riskyOperation();
} catch (error) {
  Fault.assert(error); // Throws if not a Fault

  // TypeScript now knows error is a Fault
  console.log(error.tag);
  console.log(error.context);
}
```

## Acknowledgments

This project is inspired by the [Fault](https://github.com/Southclaws/fault) library.

## License

[MIT](LICENSE)
