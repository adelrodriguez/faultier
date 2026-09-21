---
"faultier": patch
---

Reject registered classes whose constructor cannot be revived

`registry.fromSerializable` rebuilds a fault with `new Class(payloadFields)`. A class with a constructor like `constructor(id: string)` came back with `id` set to the whole payload object, silently. `registry()` now reports a type error for any constructor that does not take the fields object as its only parameter. Runtime behaviour is unchanged.

If this flags one of your classes, keep the constructor as `constructor(fields: { id: string })` and move the shorthand to a static factory such as `static forId(id: string) { return new UserNotFound({ id }) }`.
