---
"faultier": minor
---

Add a top-level `toSerializable(value)` that serializes any caught value without a registry: Faults encode themselves, native `Error`s become `UnknownError`, and other thrown values become `UnknownThrown`. `registry.toSerializable` now delegates to it.
