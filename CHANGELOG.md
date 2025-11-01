# faultier

## 0.3.1

### Patch Changes

- 06845ba: Fix type inconsistencies and improve strict typing throughout the codebase

  **Type Improvements**

  - **`isFault()` type guard**: Returns `BaseFault<FaultTag, ContextForTag<FaultTag>>` for strict registry type narrowing
  - **`extend()` return type**: Returns `BaseFault<FaultTag, ContextForTag<FaultTag>>` for proper type inference
  - **`withTag()` return type**: Properly narrows to `BaseFault<SelectedTag, ContextForTag<SelectedTag>>`
  - **`withContext()` parameter**: Now requires full `TContext` instead of `Partial<TContext>` (stricter)
  - **`toSerializable()` signature**: Simplified by removing generic parameters
  - **`SerializableFault`**: Simplified by removing generics - uses `string` and `Record<string, unknown>` for runtime representation
  - **`FaultJSON`**: Changed from interface to type, `context` now `Partial<TContext>`

  **Bug Fixes**

  - Fixed test assertions to work with strict typing (removed unnecessary type casts)
  - Corrected invalid tag names in tests to match actual error definitions

## 0.3.0

### Minor Changes

- 213e614: Add ChainFormattingOptions and smart message formatting

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
  import { getIssue, getDebug } from "faultier";

  const issue = getIssue(fault);
  const debug = getDebug(fault, " | ");
  const flat = fault.flatten(" -> ");
  ```

  After:

  ```ts
  import { BaseFault } from "faultier";

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
  BaseFault.getIssue(fault);
  // "Service unavailable. Database connection failed."

  // Custom separator
  BaseFault.getIssue(fault, { separator: " | " });
  // "Service unavailable. | Database connection failed."

  // Custom formatter
  BaseFault.getDebug(fault, { formatter: (msg) => msg.toUpperCase() });
  // "DEBUG MESSAGE ANOTHER DEBUG MESSAGE"

  // Flatten with custom options
  fault.flatten({ separator: " → ", formatter: (msg) => `[${msg}]` });
  // "[Message 1] → [Message 2]"
  ```

## 0.2.0

### Minor Changes

- 54ce54a: Add fault serialization and deserialization for network transport

  Faultier now supports serializing fault chains into plain objects and deserializing them back into full Fault instances, enabling error transmission across network boundaries or storage systems while preserving the entire error chain.

  **New Types**

  - `SerializableFault<TTag, TContext>` - Serialized representation of a Fault with full error chain support via nested `cause` objects
  - `SerializableError` - Serialized representation of plain Error objects (non-Fault)

  Both types are exported from the main package entry point.

  **New Methods**

  - **`BaseFault.toSerializable(fault)`** - Static method that converts a Fault instance into a plain object representation, recursively serializing the entire cause chain. Unlike `toJSON()` which only includes the cause's message string, `toSerializable()` preserves the full chain structure with all tags, contexts, and debug messages.

  - **`Fault.fromSerializable(data)`** - Static method that reconstructs a Fault instance from serialized data, rebuilding the complete error chain with all properties preserved. Each Fault in the chain is properly instantiated with its tag, context, debug message, and cause reference.

  **Round-trip Compatibility**

  These methods work seamlessly with `JSON.stringify()` and `JSON.parse()` for network transmission:

  ```ts
  const original = Fault.wrap(networkError)
    .withTag("API_ERROR")
    .withContext({ endpoint: "/users", status: 500 });

  // Serialize for transmission
  const serialized = BaseFault.toSerializable(original);
  const json = JSON.stringify(serialized);

  // Deserialize on the other side
  const parsed = JSON.parse(json);
  const restored = Fault.fromSerializable(parsed);

  // restored preserves all chain properties:
  // - tag, message, debug, context
  // - full cause chain with nested Faults
  // - getTags(), getFullContext(), unwrap() work correctly
  ```

  **Use Cases**

  - Transmitting errors from server to client in API responses
  - Logging structured error data to external systems
  - Persisting error states for later analysis
  - Sharing error context across service boundaries in microservices

### Patch Changes

- e764b53: Add cause message to toJSON() serialization output

  The `toJSON()` method now includes the cause's error message in its output through a `cause` field. This provides better visibility into error chains when faults are serialized for logging or transmission. The `FaultJSON` type has been updated to include the optional `cause?: string` field.

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
