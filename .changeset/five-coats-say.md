---
"faultier": minor
---

Add `toJSON()` method to `Fault` for automatic JSON serialization

`JSON.stringify(fault)` now produces the same structured output as `toSerializable()`, so faults serialize cleanly in logs, API responses, and anywhere else `JSON.stringify` is called implicitly.
