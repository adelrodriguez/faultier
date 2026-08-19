---
"faultier": patch
---

Normalize a thrown `-0` cause to `0` during serialization, matching JSON transport semantics

`normalizeThrown` already canonicalizes non-finite numbers to `null` the way `JSON.stringify` does, but it let `-0` through untouched — so the in-memory wire object differed from what a consumer got back after `JSON.parse(JSON.stringify(...))`. Serialized thrown causes now survive the wire identically.
