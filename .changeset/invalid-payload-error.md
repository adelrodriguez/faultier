---
"faultier": minor
---

`fromSerializable` and `registry.fromSerializable` now throw `InvalidPayloadError` from `faultier/errors` for a malformed wire payload, instead of a bare `Error`. Its `reason` field names the failed check (`expected __faultier: true`, `_tag must be a string`, or `meta must be an object`).

The message is unchanged (`Invalid Faultier payload: <reason>`), so code that matches on it keeps working. Code that checks `error.name === "Error"` or `error.constructor === Error` must switch to `instanceof InvalidPayloadError`.
