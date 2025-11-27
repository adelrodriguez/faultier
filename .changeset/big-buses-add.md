---
"faultier": major
---

Refactor internal architecture and add dedicated extend export

**Breaking Changes**

1. **Internal structure reorganized**: Core implementation moved from `src/` to `src/lib/` directory. This is transparent to users importing from the main package entry point.

2. **Simplified type exports**: Streamlined exported types to public API essentials:
   - **Removed exports**: `ChainFormattingOptions`, `FaultRegistry` (internal implementation details)
   - **Added exports**: `ContextForTag`, `FaultJSON`, `FaultTag` (type-safe registry utilities)
   - **Unchanged exports**: `SerializableError`, `SerializableFault`
3. **New package export**: Added `faultier/extend` export providing the `extend()` function as a standalone entry point for extending custom Error classes with Fault functionality.

4. **TypeScript peer dependency**: Locked to specific version `5.9.3` (previously `^5`). This ensures consistent type behavior across installations.

**Migration Guide**

Most users should experience no breaking changes. The core API (`Fault.wrap()`, `Fault.create()`, `Fault.extend()`) remains unchanged.

**If you were importing removed types:**

- `FaultRegistry` - This was never meant to be imported directly. Use module augmentation instead:

  ```ts
  declare module "faultier" {
    interface FaultRegistry {
      tags: "MY_TAG";
      context: { MY_TAG: { foo: string } };
    }
  }
  ```

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
