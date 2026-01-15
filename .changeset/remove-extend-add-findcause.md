---
"faultier": major
---

Remove `extend` functionality and add `findCause` helper method

**Breaking Changes**

- **Removed `faultier/extend` export**: The `extend()` function and all related types have been removed. This functionality was complex, fragile, and had limited use cases.

  **Before:**

  ```ts
  import { extend } from "faultier/extend"

  class HttpError extends Error {
    constructor(
      message: string,
      public statusCode: number
    ) {
      super(message)
    }
  }

  const HttpFault = extend(HttpError)
  const fault = HttpFault.create("Not found", 404).withTag("HTTP_ERROR", { path: "/api/users" })
  ```

  **After:**

  ```ts
  import Fault from "faultier"

  class HttpError extends Error {
    constructor(
      message: string,
      public statusCode: number
    ) {
      super(message)
    }
  }

  // Wrap your custom error
  throw Fault.wrap(new HttpError("Not found", 404)).withTag("HTTP_ERROR", { path: "/api/users" })

  // Find the original error in the chain
  const httpError = Fault.findCause(error, HttpError)
  if (httpError) {
    console.log(httpError.statusCode) // 404 - Fully typed!
  }
  ```

- **Removed types**: `WithBaseFaultMethods`, `ExtendedTaggedFault`, `ExtendedFaultBase` are no longer exported.
- **Removed `Faultier.Tagged` export**: `Faultier.Tagged` is no longer exported. Replace it with `TaggedFault<typeof Fault, TTag>`.
- **Context handling updated**: `withContext` is removed; pass context when calling `withTag(tag, context)` or `create(tag, context)` for non-optional tags. Use optional tags with `?`, tags with `never` disallow context, and `context` now defaults to `undefined` so `toJSON`/`toSerializable` omit it when undefined.

**New Features**

- **`Fault.findCause(error, ErrorClass)`**: Searches the error chain for a cause matching the given Error class. Returns the first matching error with full type inference, or `undefined` if not found.

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
    console.log(httpError.statusCode) // Fully typed as number!
  }
  ```

  This provides a simpler, more robust alternative to the removed `extend()` functionality. Instead of creating extended fault classes, you can now:
  1. Wrap custom errors with `Fault.wrap()`
  2. Search for them in the error chain with `Fault.findCause()`

**Migration Guide**

If you were using `extend()`:

1. Replace `HttpFault.create(message, statusCode)` with `Fault.wrap(new HttpError(message, statusCode))`
2. Replace `error instanceof HttpFault` checks with `Fault.findCause(error, HttpError)`
3. Access the original error's properties through the result of `findCause()`

If you were using `Faultier.Tagged`:

```ts
// Before
import Faultier from "faultier"

type Tagged = Faultier.Tagged<typeof Fault, "HTTP_ERROR">

// After
import Faultier, { type TaggedFault } from "faultier"

type Tagged = TaggedFault<typeof Fault, "HTTP_ERROR">
```

Context usage now moves onto `withTag(tag, context)`:

```ts
// Before
Fault.wrap(error).withTag("HTTP_ERROR").withContext({ path: "/api/users" })

// After
Fault.wrap(error).withTag("HTTP_ERROR", { path: "/api/users" })
```

The new approach is more flexible as it works with any Error subclass without requiring special wrapper classes.
