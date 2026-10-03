---
"faultier": minor
---

Add `Type` to registries for deriving the fault union

`typeof AuthFault.Type` resolves to the union of every fault the registry holds, so you no longer need to hand-write it next to the registry. The member exists only at the type level and is `undefined` at runtime.
