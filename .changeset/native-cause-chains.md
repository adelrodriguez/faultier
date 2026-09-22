---
"faultier": patch
---

Follow native `Error.cause` chains

`unwrap()`, `flatten()`, `getTags()`, and `getContext()` stopped at the first non-Fault error, so wrapping `new Error("mid", { cause: root })` lost `root`, along with any Faults below it. Serialization dropped it too. Traversal now continues through native errors, and the `"error"` cause in the wire format carries an optional nested `cause` that `fromSerializable` restores. Existing payloads still deserialize unchanged.
