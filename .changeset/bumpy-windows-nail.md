---
"faultier": minor
---

Add ChainFormattingOptions and smart message formatting

**Breaking Changes**

1. **Helper functions removed**: `getIssue()` and `getDebug()` are no longer exported. They are now static methods on `BaseFault`.

2. **Smart formatting by default**: Messages now automatically have periods added if they don't end with punctuation (`.!?`).

3. **API signature changes**:
   - `getIssue(fault, separator)` → `getIssue(fault, options?)`
   - `getDebug(fault, separator)` → `getDebug(fault, options?)`
   - `flatten(separator)` → `flatten(options?)`

**Migration Guide**

Before:
```ts
import { getIssue, getDebug } from 'faultier';

const issue = getIssue(fault);
const debug = getDebug(fault, " | ");
const flat = fault.flatten(" -> ");
```

After:
```ts
import { BaseFault } from 'faultier';

const issue = BaseFault.getIssue(fault);
const debug = BaseFault.getDebug(fault, { separator: " | " });
const flat = fault.flatten({ separator: " -> " });
```

**New Features**

- **ChainFormattingOptions**: New type for customizing message formatting with `separator` and `formatter` options
- **Smart defaults**:
  - `getIssue()` and `getDebug()`: Trim messages and add periods if missing (separator: `" "`)
  - `flatten()`: Trim messages only (separator: `" -> "`)
- **toJSON() improvements**: Uses " → " separator with smart formatting for better readability

**Examples**

```ts
// Default formatting (adds periods)
BaseFault.getIssue(fault)
// "Service unavailable. Database connection failed."

// Custom separator
BaseFault.getIssue(fault, { separator: " | " })
// "Service unavailable. | Database connection failed."

// Custom formatter
BaseFault.getDebug(fault, { formatter: msg => msg.toUpperCase() })
// "DEBUG MESSAGE ANOTHER DEBUG MESSAGE"

// Flatten with custom options
fault.flatten({ separator: " → ", formatter: msg => `[${msg}]` })
// "[Message 1] → [Message 2]"
```
