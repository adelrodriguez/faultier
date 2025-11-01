---
"faultier": patch
---

Fix type inconsistencies and improve strict typing throughout the codebase

**Type Improvements**

- **`isFault()` type guard**: Returns `BaseFault<FaultTag, ContextForTag<FaultTag>>` for strict registry type narrowing
- **`extend()` return type**: Returns `BaseFault<FaultTag, ContextForTag<FaultTag>>` for proper type inference
- **`withTag()` return type**: Properly narrows to `BaseFault<SelectedTag, ContextForTag<SelectedTag>>`
- **`withContext()` parameter**: Now requires full `TContext` instead of `Partial<TContext>` (stricter)
- **`toSerializable()` signature**: Simplified by removing generic parameters
- **`SerializableFault`**: Simplified by removing generics - uses `string` and `Record<string, unknown>` for runtime representation
- **`FaultJSON`**: Changed from interface to type, `context` now `Partial<TContext>`

**Bug Fixes**

- Fixed test assertions to work with strict typing (removed unnecessary type casts)
- Corrected invalid tag names in tests to match actual error definitions
