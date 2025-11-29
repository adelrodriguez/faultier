---
"faultier": patch
---

Export extended fault type interfaces for improved TypeScript developer experience

Exports previously internal TypeScript interfaces and types from the `extend()` functionality to improve type inference and IDE autocomplete when working with extended faults:

- `FaultRegistry` - Now exported from main package entry for module augmentation
- `WithBaseFaultMethods` - Helper type ensuring extended faults have BaseFault methods  
- `ExtendedFaultBase` - Base extended fault interface before `.withTag()` is called
- `ExtendedFaultWithTag` - Extended fault interface after calling `.withTag()`
- `ExtendedFaultWithContext` - Extended fault interface after calling `.withContext()`

The `extend()` function now has explicit return types providing better TypeScript support throughout the fault creation and transformation chain.

**Critical fix:** Enable TypeScript declaration splitting (`dts.splitting: true`) to resolve module augmentation type recognition issue. Previously, when using `declare module "faultier"` to extend the `FaultRegistry` interface, extended faults created with `extend()` weren't properly recognizing the augmented types because the generated `.d.ts` files weren't importing the `FaultRegistry` type from its own module - they were duplicating the type definition inline. With declaration splitting enabled, the build now correctly generates imports like `import type { FaultRegistry } from './types'`, ensuring that module augmentation properly applies to all extended fault types.

**Build improvements:**

- Enable TypeScript declaration splitting for better tree-shaking of type imports and correct module augmentation behavior
- Add automatic output directory cleaning before builds to prevent stale artifacts

This change is purely additive and improves the developer experience without affecting runtime behavior.