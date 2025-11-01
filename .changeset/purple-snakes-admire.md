---
"faultier": patch
---

Add cause message to toJSON() serialization output

The `toJSON()` method now includes the cause's error message in its output through a `cause` field. This provides better visibility into error chains when faults are serialized for logging or transmission. The `FaultJSON` type has been updated to include the optional `cause?: string` field.
