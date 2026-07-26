---
"faultier": major
---

Make registry constructor-map state internal. Registry objects no longer expose the undocumented `__faultier` property, and `merge()` now rejects structurally forged or spread-cloned registries; pass only registries created by `registry()` or `merge()`.
