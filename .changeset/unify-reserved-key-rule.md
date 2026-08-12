---
"faultier": minor
---

**Stricter `Tagged` field validation** — field names that previously constructed without error now throw `ReservedFieldError` at construction. Before upgrading, check your `Tagged` field names against the full list of newly rejected keys: `constructor`, `toString`, `toLocaleString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `__proto__`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`, and `__faultier`. Migration: rename the field (e.g. `constructor` → `constructorName`).

These names were already broken in v3 — none of them survived a serialization round-trip (deserialization renamed them to `__payload_`-prefixed keys), a string `toString` field broke `${fault}` string coercion, and a `__proto__` field could mutate the instance's prototype via `Object.assign`. The new validation rejects them up front instead of failing later.

Underlying change: reserved-key handling is unified behind a single `isReservedKey` rule shared by construction, serialization, and deserialization — a key is reserved when it is a wire envelope key or exists anywhere on `Fault`'s prototype chain. This also fixes serialization: a payload field named `__faultier` can no longer clobber the wire-format marker and produce output that `fromSerializable` rejects.

Deserialization behavior is unchanged: colliding keys in wire payloads are still preserved via `__payload_` prefixing. Public API and wire format are otherwise unchanged.
