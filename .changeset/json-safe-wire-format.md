---
"faultier": patch
---

Add a JSON-safe `SerializableValue` wire format and narrow `SerializableFault` and `SerializableCause` accordingly. `withMeta` and `Tagged` fields now require serializable values, while thrown causes are normalized during serialization. Meta and payload typing is stricter (technically breaking, shipped as a patch by maintainer decision).
