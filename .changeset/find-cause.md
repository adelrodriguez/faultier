---
"faultier": minor
---

Add `findCause(err, Class)` and `registry.findCause(err, tag)` to get a typed fault out of the cause chain without `unwrap().find(...)` and a hand-written type guard.

```ts
Faultier.findCause(err, NotFoundError) // NotFoundError | undefined
AppFault.findCause(err, "NotFoundError") // NotFoundError | undefined
```

Both take any caught value, return `undefined` for non-Faults, and search from the head, so the fault itself can match. `findCause` works with any class, including native errors such as `TypeError`. `registry.findCause` uses the same membership rule as `registry.is`: the tag must be registered and the instance must come from the registered constructor.
