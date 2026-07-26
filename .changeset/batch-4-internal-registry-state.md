---
"faultier": major
---

Make registry constructor-map state internal. Registry objects no longer expose the undocumented `__faultier` property, and `merge()` now rejects structurally forged or spread-cloned registries; pass only registries created by `registry()` or `merge()`.

Standalone and registry matchers now share matching behavior and infer independent handler and fallback result unions. Standalone `matchTags` now accurately distinguishes exhaustive handler maps from partial or possibly undefined handlers, while registry matchers continue to accept `unknown` input and guard registered constructor identity rather than matching by tag alone.

Faultier now requires TypeScript 5.4 or newer because its public matcher declarations use the `NoInfer` intrinsic.
