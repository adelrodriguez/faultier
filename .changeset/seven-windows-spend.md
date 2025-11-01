---
"faultier": patch
---

Fix package exports configuration to point to built distribution files

Previously, the package.json incorrectly pointed the "module" field to the source file (`src/index.ts`), which would cause import failures when the package is published and consumed by users. This change updates the package configuration to properly export the built files from the `dist/` directory:

- Added `main` field pointing to `./dist/index.js` for CommonJS compatibility
- Updated `module` field to point to `./dist/index.js` instead of source
- Added `types` field pointing to `./dist/index.d.ts` for TypeScript type definitions
- Added `exports` field with proper ESM and TypeScript support

This ensures the package works correctly when installed as a dependency, with proper module resolution and TypeScript type support.
