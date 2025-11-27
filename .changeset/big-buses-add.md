---
"faultier": major
---

Refactor internal architecture and simplify FaultRegistry type system

**Breaking Changes**

1. **Simplified FaultRegistry interface**: The `FaultRegistry` interface now directly maps tag names to their context types, eliminating the separate `tags` and `context` properties for a more intuitive API.

   **Before:**
   ```ts
   declare module "faultier" {
     interface FaultRegistry {
       tags: "DATABASE_ERROR" | "AUTH_ERROR";
       context: {
         DATABASE_ERROR: { query: string };
         AUTH_ERROR: { userId: string };
       };
     }
   }
   ```

   **After:**
   ```ts
   declare module "faultier" {
     interface FaultRegistry {
       DATABASE_ERROR: { query: string };
       AUTH_ERROR: { userId: string };
       GENERIC_ERROR: never; // Use 'never' to prevent withContext()
     }
   }
   ```

   **Benefits:**
   - More concise and easier to read
   - Supports extending with grouped error types using TypeScript's `extends` keyword
   - Better type inference with `never` for tags without context (prevents `withContext()` at type level)
   - Eliminates redundancy between tag union and context mapping

2. **Internal structure reorganized**: Core implementation moved from `src/` to `src/lib/` directory. This is transparent to users importing from the main package entry point.

3. **Simplified type exports**: Streamlined exported types to public API essentials:
   - **Removed exports**: `ChainFormattingOptions`, `FaultRegistry` (internal implementation details)
   - **Added exports**: `ContextForTag`, `FaultJSON`, `FaultTag` (type-safe registry utilities)
   - **Unchanged exports**: `SerializableError`, `SerializableFault`

4. **New package export**: Added `faultier/extend` export providing the `extend()` function as a standalone entry point for extending custom Error classes with Fault functionality.

5. **TypeScript peer dependency**: Locked to specific version `5.9.3` (previously `^5`). This ensures consistent type behavior across installations.

**Migration Guide**

**Updating your FaultRegistry (REQUIRED):**

All projects using custom tags must update their module augmentation:

```ts
// Old format (0.3.x and earlier)
declare module "faultier" {
  interface FaultRegistry {
    tags: "MY_TAG" | "OTHER_TAG";
    context: {
      MY_TAG: { foo: string };
      OTHER_TAG: { bar: number };
    };
  }
}

// New format (0.4.x and later)
declare module "faultier" {
  interface FaultRegistry {
    MY_TAG: { foo: string };
    OTHER_TAG: { bar: number };
  }
}
```

For tags that don't need context, use `never`:

```ts
declare module "faultier" {
  interface FaultRegistry {
    WITH_CONTEXT: { data: string };
    NO_CONTEXT: never; // TypeScript will prevent .withContext() calls
  }
}
```

For larger applications, group related errors:

```ts
type DatabaseErrors = {
  DB_CONNECTION_ERROR: { host: string; port: number };
  DB_QUERY_ERROR: { query: string; table: string };
};

type AuthErrors = {
  AUTH_INVALID_TOKEN: { token: string };
  AUTH_EXPIRED_SESSION: { sessionId: string };
};

declare module "faultier" {
  interface FaultRegistry extends DatabaseErrors, AuthErrors {
    GENERIC_ERROR: never;
  }
}
```

**If you were importing removed types:**

- `FaultRegistry` - This was never meant to be imported directly. Use module augmentation as shown above.

- `ChainFormattingOptions` - This type was internal. The options are passed directly to methods like `BaseFault.getIssue()` and don't need to be imported.

**New: Standalone extend() export**

You can now import `extend()` directly from `faultier/extend`:

```ts
import { extend } from "faultier/extend";

class HttpError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

const HttpFault = extend(HttpError);
```

**New Features**

- **Type-safe prevention of withContext()**: Tags with `never` context type now properly prevent `withContext()` calls at compile time, returning `never` type
- **Improved handler typing**: `Fault.handle()` now correctly types handlers based on whether tags require context or not
- **Better type inference**: `ContextForTag<T>` utility type now properly handles `never` for tags without context
- **Documentation improvements**: Added examples of grouping error types for larger applications and using `never` to prevent context
- Dedicated `./extend` export for cleaner imports of the `extend()` function
- Improved internal organization for better maintainability
- Added `withDebug(debug)` method to set only the debug message
- Added `withMessage(message)` method to set only the user-facing message

**Bug Fixes**

- Fixed `IS_FAULT` symbol being lost after calling `clearContext()` on extended faults. The symbol is now properly preserved using `Object.defineProperty()` with non-enumerable configuration, ensuring `Fault.isFault()` checks work correctly throughout the fault's lifecycle.
- Fixed stack traces being lost when calling `withTag()` or `withContext()` on extended faults. Stack traces now correctly point to the original fault creation location rather than where transformation methods were called, improving debuggability.
- Improved type safety for `IS_FAULT` and `UNKNOWN` symbols by declaring them as `unique symbol` types instead of plain `symbol`, preventing accidental symbol collisions.

**Internal Changes**

- Deleted `src/core.ts` in favor of reorganized `src/lib/index.ts`
- Moved all tests to `src/lib/__tests__/` directory
- Updated build configuration to support multiple entry points
- Refactored `IS_FAULT` symbol initialization to use `Object.defineProperty()` in constructors instead of class field initialization
- Added `WithIsFault` type helper for safer symbol property access in type guards
