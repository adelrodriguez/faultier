---
"faultier": patch
---

Remove default export and `BaseFault` in favor of named `define` export

The default export (`import Faultier from "faultier"`) and `BaseFault` export are removed. Use the named `define` export directly instead.

**Migration:**

```ts
// Before
import Faultier from "faultier"
export class Fault extends Faultier.define<AppErrors>() {}

// After
import { define } from "faultier"
export class Fault extends define<AppErrors>() {}
```

If you were using `BaseFault` as a type or for static methods:

```ts
// Before
import { BaseFault } from "faultier"
const isFault = BaseFault.isFault(error)

// After
import { define } from "faultier"
const BaseFault = define()
const isFault = BaseFault.isFault(error)
```