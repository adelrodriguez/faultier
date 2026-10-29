---
"faultier": patch
---

Make `registry.is` a constant-time tag lookup instead of an `instanceof` check against every registered constructor, which speeds up `matchTag` and `matchTags` on large merged registries.

`registry.is` now returns `false` for a subclass of a registered constructor whose `_tag` is not itself registered, consistent with `matchTag` and `matchTags` dispatching by `_tag`.
