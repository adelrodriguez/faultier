---
"faultier": major
---

### Breaking changes

- Registry model changed: module augmentation (`FaultRegistry`) and the default `Fault` class are gone. Migration: `import Faultier from "faultier"`, define a registry type, then `class Fault extends Faultier.define<Registry>() {}` and use that class for `create`, `wrap`, `handle`, `matchTag(s)`, etc.
- Removed `faultier/extend` export and the `extend()` helper. Migration: add custom methods directly to your `Fault` class; `instanceof` works with your defined class.
- Tag + context API simplified: `withContext` removed; use `Fault.create(tag, context?)` and `fault.withTag(tag, context?)`. Context can now be `undefined` when omitted, so update access to use optional chaining where needed.
- Debug terminology renamed: `withDebug` → `withDetails`, `getDebug` → `getDetails`, `fault.debug` → `fault.details`, and serialized `debug` → `details`.
- Serialization format changed: `toJSON()` now returns `SerializableFault` (same as `toSerializable()`), includes `_isFault`, `details`, `meta`, and nested `cause` objects. It no longer aggregates chain messages. Migration: call `Fault.getIssue()`/`Fault.getDetails()` for aggregated strings and update stored JSON to add `_isFault`, rename `debug` to `details`, and include `meta` if used.
- Type exports changed: removed `FaultJSON`, `FaultRegistry`, `FaultTag`, `ContextForTag`. New/renamed exports: `TaggedFault`, `TagsOf`, `FaultContext`, `ChainFormattingOptions`. Update type imports and any `Tagged` usage.
- `fault.name` now includes the tag (`Fault[TAG]`). Update any `name` checks or prefer `Fault.isFault()`/`Faultier.isFault()`.
- Tagging/context updates now mutate the instance (no `TaggedFault` class cloning). If you relied on immutability, create fresh faults before branching.

### Migration example

```ts
// Before
import Fault from "faultier"

declare module "faultier" {
  interface FaultRegistry {
    DATABASE_ERROR: { query: string }
    GENERIC_ERROR: never
  }
}

throw Fault.wrap(err).withTag("DATABASE_ERROR").withContext({ query: "SELECT 1" })

// After
import Faultier from "faultier"

type AppErrors = {
  DATABASE_ERROR: { query: string }
  GENERIC_ERROR: never
}

export class Fault extends Faultier.define<AppErrors>() {}

throw Fault.wrap(err).withTag("DATABASE_ERROR", { query: "SELECT 1" })
```
