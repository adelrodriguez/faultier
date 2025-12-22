---
"faultier": patch
---

Fix context type safety for tagged faults by introducing partial context types

**Context Type System Improvements:**

- **Added `PartialContextForTag<T>` type** to correctly represent context that may or may not be present on a tagged fault. When you call `.withTag()` without `.withContext()`, the fault now correctly has an empty context object (`{}`) typed as `Partial<ContextForTag<T>>`.

- **Simplified type hierarchy** by consolidating `FaultWithContext` and `FaultWithTag` into a single `TaggedFault` class. Both `withContext()` and `clearContext()` are now available on all tagged faults, eliminating the need for separate type branches.

- **Improved type narrowing** after `isFault()` checks. When checking `fault.tag === "MY_TAG"`, TypeScript now correctly narrows the context type to `Partial<{ ... }>`, allowing safe property access with optional chaining or `in` checks.

**Extended Fault API Changes:**

- Renamed `ExtendedFaultWithTag` → `ExtendedTaggedFault` for consistency
- Removed `ExtendedFaultWithContext` type (merged into `ExtendedTaggedFault`)
- Both extended and core faults now follow the same type patterns

**Migration:**

Existing code continues to work without changes. The improvements primarily enhance type safety and eliminate false positive TypeScript errors when working with fault chains and context properties.

**Before:**
```typescript
const fault = Fault.create("MY_TAG")
// TypeScript error: context type was `never` even though it's actually `{}`
if ("requestId" in fault.context) { ... }
```

**After:**
```typescript
const fault = Fault.create("MY_TAG")
// No error: context is correctly typed as Partial<{ requestId: string }>
if ("requestId" in fault.context) {
  // TypeScript knows fault.context.requestId is string | undefined
  console.log(fault.context.requestId)
}
```