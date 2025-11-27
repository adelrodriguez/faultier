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
      tags: "MY_TAG"
      context: { MY_TAG: { foo: string } }
    }
  }
  ```

- `ChainFormattingOptions` - This type was internal. The options are passed directly to methods like `BaseFault.getIssue()` and don't need to be imported.

**New: Standalone extend() export**

You can now import `extend()` directly from `faultier/extend`:

```ts
import { extend } from "faultier/extend"

class HttpError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message)
  }
}

const HttpFault = extend(HttpError)
```

**New Features**

- Dedicated `./extend` export for cleaner imports of the `extend()` function
- Improved internal organization for better maintainability

**Internal Changes**

- Deleted `src/core.ts` in favor of reorganized `src/lib/index.ts`
- Moved all tests to `src/lib/__tests__/` directory
- Updated build configuration to support multiple entry points
