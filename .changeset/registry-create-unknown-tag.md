---
"faultier": patch
---

`registry.create` and `registry.wrap(...).as` now throw `TypeError: Unknown Fault registry tag '<tag>'.` for a tag the registry does not contain, instead of an opaque `... is not a constructor` error. This includes inherited object keys such as `toString`.
