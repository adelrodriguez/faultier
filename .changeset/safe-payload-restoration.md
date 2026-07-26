---
"faultier": patch
---

Fix generic and registry deserialization so reserved payload collisions never overwrite existing `__payload_` fields, prototype-sensitive keys are restored safely, registered constructors retain normalized fields, and registered nested causes reconstruct beneath unregistered outer faults.
