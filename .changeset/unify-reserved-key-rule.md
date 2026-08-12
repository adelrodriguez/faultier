---
"faultier": minor
---

Unify reserved-key handling behind a single `isReservedKey` rule shared by construction, serialization, and deserialization. This fixes two unsafe edge cases and closes an inconsistency:

- `Tagged` constructors now reject field names that shadow inherited prototype members (`toString`, `valueOf`, `hasOwnProperty`, ...). Previously these were accepted at construction but renamed with a `__payload_` prefix on deserialization, so they never round-tripped cleanly — and a `__proto__` field could mutate the instance's prototype via `Object.assign`.
- `__faultier` is now a reserved field name. Previously a payload field named `__faultier` could clobber the wire-format marker during serialization, producing output that `fromSerializable` rejects.

Deserialization behavior is unchanged: colliding keys in wire payloads are still preserved via `__payload_` prefixing. Public API and wire format are otherwise unchanged.
