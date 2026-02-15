---
"faultier": minor
---

Complete v2 rewrite. The v1 top-level API (`define`, `wrap`, `create`, `handle`, `assert`, `IS_FAULT`, `NO_FAULT_TAG`, `UNKNOWN`) is fully removed. `matchTag` and `matchTags` are now scoped to registry instances rather than standalone exports.

### New API

- **`Fault`** — abstract base class with fluent `.withMessage()`, `.withDetails()`, `.withDescription()`, `.withMeta()`, `.withCause()` methods
- **`Tagged(tag)<Fields>()`** — curried factory for creating typed Fault subclasses with a `_tag` discriminant
- **`registry({ ...ctors })`** — creates scoped fault registries with `create`, `wrap().as`, `is`, `matchTag`, `matchTags`, `toSerializable`, `fromSerializable`
- **`merge(a, b, ...rest)`** — combines registries with conflict detection; full type preservation across N registries via recursive conditional types
- **`isFault`** — type guard for any Fault instance
- **`fromSerializable`** — top-level generic deserialization

### Fault methods

- **`withDescription(message, details?)`** — convenience setter for user-facing message and optional technical details in one call
- **`flatten(options?)`** — configurable chain-to-string with `field: "message" | "details"` support. Replaces the removed `getIssue()` and `getDetails()` methods.
- **`getContext()`** — merged metadata from the cause chain (head wins on conflicts). Renamed from `getFullMeta()`.
- **`unwrap()`** — raw cause chain as an array
- **`getTags()`** — `_tag` values from the cause chain

### Removed methods

- `getIssue()` — use `flatten()` instead
- `getDetails()` — use `flatten({ field: "details" })` instead
- `getFullMeta()` — renamed to `getContext()`

### Serialization

- Full round-trip serialization/deserialization with `__faultier: true` wire format
- Nested Fault cause recursion, Error cause preservation, thrown value passthrough
- Payload key collision handling (`__payload_` prefix for reserved key conflicts)
- Depth guard on deserialization matching serialization (`MAX_CAUSE_DEPTH = 100`)

### Runtime safety

- Max-depth guard (`MAX_CAUSE_DEPTH = 100`) on cause chain traversal in `unwrap()`, preventing stack overflow on circular causes
- Same depth guard on `toSerializable()` and `fromSerializable()` paths
- Safe `JSON.stringify` with try/catch fallback for circular objects

### Internal errors

- `ReservedFieldError`, `RegistryTagMismatchError`, `RegistryMergeConflictError` — all extend Fault with static `_tag`
