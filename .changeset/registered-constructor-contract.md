---
"faultier": patch
---

Reject registered classes whose constructor cannot be revived

`registry.fromSerializable` rebuilds a fault with `new Class(payloadFields)`. A class with a constructor like `constructor(id: string)` came back with `id` set to the whole payload object, silently. `registry()` now reports a type error for any constructor that does not take the fields object as its only parameter, and for a parameterless constructor on a class that has payload fields. Runtime behaviour is unchanged.

This is a breaking type change: code that registered such a class compiled before and no longer does. It ships as a patch because that code already corrupted data on revive.

- If this flags one of your classes, keep the constructor as `constructor(fields: { id: string })` and move the shorthand to a static factory such as `static forId(id: string) { return new UserNotFound({ id }) }`.
- A generic wrapper that forwards an unresolved map, such as `function make<const M extends ...>(ctors: M) { return registry(ctors) }`, no longer compiles, because the check cannot run on an unresolved type parameter. Call `registry()` with a concrete map, or cast inside the wrapper.
