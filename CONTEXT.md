# Faultier Context

## Domain Glossary

- **Fault**: An `Error` subclass with a stable string `_tag`, fluent context methods, cause-chain helpers, and wire serialization.
- **Tag**: The string discriminant stored in `_tag`. Tags identify fault variants for matching and registry lookup.
- **Tagged fault**: A `Fault` subclass created by `Tagged(tag)<Fields>()`. Its constructor fields become typed payload fields.
- **Registry**: A constructor-identity-scoped collection created by `registry()`. It creates, wraps, matches, serializes, and reconstructs its registered fault union.
- **Payload field**: A user-defined own property outside the canonical Fault fields and methods.
- **Reserved key**: A canonical field or Fault method name that payload data cannot overwrite directly.
- **Wire format**: A plain `SerializableFault` object marked with `__faultier: true`. The marker belongs to serialized data, not registry objects.
- **Cause chain**: The sequence from the current fault (head) toward the original cause (leaf).

## Behavioral Model

- Registry membership uses constructor identity, not only `_tag`. A foreign Fault with the same tag is not a registry member.
- Standalone matching accepts a typed Fault union. Registry matching accepts `unknown`, checks membership, then uses the same tag dispatch.
- `Fault.toSerializable()` encodes a fault. `fromSerializable()` reconstructs a generic Fault, while `registry.fromSerializable()` restores registered subclasses when possible.
- Generic and registry reconstruction share validation, payload restoration, cause recursion, and depth accounting.
- Payload keys that collide with Fault properties or methods receive repeated `__payload_` prefixes until they are safe and unique.
- Cause traversal, serialization, and deserialization stop after 100 nested fault edges.
- `unwrap()` and related helpers order chains from head to leaf. Metadata merging gives the head precedence.

## Public Entrypoints

- `faultier`: Core runtime API (`Fault`, `Tagged`, registries, matching, and generic deserialization).
- `faultier/errors`: Faultier's own error classes.
- `faultier/types`: Public type-only contracts.

## Codebase Map

```text
src/
├── index.ts                  # Core runtime entrypoint
├── errors.ts                 # faultier/errors
├── types.ts                  # faultier/types
├── __tests__/                # Public API, type, entrypoint, and metadata tests
└── lib/
    ├── errors.ts             # Library error classes
    ├── fault.ts              # Fault, isFault, and Fault encoding
    ├── internal.ts           # Constructor types and private registry state
    ├── match.ts              # Shared matching runtime and standalone signatures
    ├── merge.ts              # Registry composition
    ├── registry.ts           # Registry construction and methods
    ├── serialize.ts          # Wire contracts, arbitrary values, validation, and reconstruction
    ├── tagged.ts             # Tagged subclass factory
    └── utils.ts              # Shared constants and payload collection
```

Public tests import only `src/index.ts`, `src/errors.ts`, or `src/types.ts`. `scripts/verify-package.ts` separately validates built package resolution, runtime export surfaces, constructor identity, and strict NodeNext declaration consumption.
