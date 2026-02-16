---
"faultier": minor
---

Add `matchTag` and `matchTags` functions for union-driven tag matching

Match error tags directly from a `Fault` union type without needing a registry. `matchTag` handles a single tag with an optional fallback, `matchTags` accepts a handler map keyed by tag. Both infer valid tags from the error type.
