---
"faultier": minor
---

Add `fault.findCause(Class)` and `registry.findCause(err, tag)` to get a typed fault out of the cause chain without `unwrap().find(...)` and a hand-written type guard.

```ts
fault.findCause(NotFoundError) // NotFoundError | undefined
AppFault.findCause(err, "NotFoundError") // NotFoundError | undefined
```

Both search from the head, so the fault you call them on can itself match. `fault.findCause` works with any class, including native errors such as `TypeError`. `registry.findCause` uses the same membership rule as `registry.is`: the tag must be registered and the instance must come from the registered constructor.

`findCause` is now a Fault method, so it becomes a reserved key. `Tagged` fields named `findCause` are rejected with `ReservedFieldError`, and a `findCause` key in incoming wire data is restored as `__payload_findCause`.
