# faultier

## 0.1.2

### Patch Changes

- 7796275: Refactor helper functions to use BaseFault type and add comprehensive test coverage for getIssue and getDebug utilities

## 0.1.1

### Patch Changes

- 5ada53d: Fix package exports configuration to point to built distribution files

  Previously, the package.json incorrectly pointed the "module" field to the source file (`src/index.ts`), which would cause import failures when the package is published and consumed by users. This change updates the package configuration to properly export the built files from the `dist/` directory:

  - Added `main` field pointing to `./dist/index.js` for CommonJS compatibility
  - Updated `module` field to point to `./dist/index.js` instead of source
  - Added `types` field pointing to `./dist/index.d.ts` for TypeScript type definitions
  - Added `exports` field with proper ESM and TypeScript support

  This ensures the package works correctly when installed as a dependency, with proper module resolution and TypeScript type support.

## 0.1.0

### Minor Changes

- 0665bff: Initial implementation of Faultier - extensible error handling for TypeScript

  Faultier is a comprehensive error handling library built with TypeScript that provides enhanced error objects with tagging, context, debug messages, and error chaining capabilities. This release includes the complete core implementation and comprehensive test coverage.

  **Core Architecture**

  - **BaseFault class** - Abstract base class providing the foundation for all fault functionality including fluent API methods for error enrichment
  - **Fault class** - Main error class extending BaseFault with static factory methods (`wrap`, `create`, `extend`)
  - **Type-safe registry system** - Module augmentation support through `FaultRegistry` interface allowing applications to define custom fault tags and context schemas with full type inference
  - **Error chaining** - Built-in support for wrapping and unwrapping error chains through the `cause` property

  **Key Features**

  - **Tag-based categorization** - Type-safe error classification system using string tags defined in the registry
  - **Structured context** - Attach typed metadata to errors with automatic merging and clearing capabilities
  - **Debug messages** - Separate internal debug messages from user-facing error messages
  - **Chain traversal** - Methods to unwrap error chains (`unwrap`), flatten messages (`flatten`), collect tags (`getTags`), and merge contexts (`getFullContext`)
  - **Custom error extensions** - `Fault.extend()` method to add fault functionality to existing Error subclasses while preserving their properties
  - **Type guards** - `Fault.isFault()` with proper type narrowing to registry types
  - **JSON serialization** - Built-in `toJSON()` for structured error logging

  **Helper Functions**

  - `getIssue()` - Extract all user-facing messages from a fault chain
  - `getDebug()` - Extract all debug messages from a fault chain

  **Testing**

  Comprehensive test suite with 500+ lines of tests covering:

  - Core functionality (wrapping, tagging, context management)
  - Error chain traversal and context merging
  - Type safety with registry augmentation
  - Custom error class extensions
  - Edge cases and error scenarios

  **Documentation**

  - Extensive JSDoc comments on all public APIs with usage examples
  - Type definitions exported for consumer applications
  - Module augmentation patterns for custom fault registries
