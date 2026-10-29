---
"faultier": minor
---

Add `isSerializableFault(value)`, a type guard for wire payloads received over RPC or HTTP. It returns `true` only when the envelope fields (`_tag`, `name`, `message`, `details`, `stack`, `meta`) and the whole cause chain match `SerializableFault`, so `fromSerializable` will accept the value without throwing. As with `fromSerializable`, payload and `meta` values are not deep-validated.
