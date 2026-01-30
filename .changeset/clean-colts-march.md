---
"faultier": patch
---

Fix type resolution for package consumers by replacing internal path aliases with relative imports

The generated `dist/index.d.ts` previously contained unresolved `#lib/*` path aliases, breaking type inference for consumers importing the package. Imports now use relative paths so declaration files resolve correctly.
