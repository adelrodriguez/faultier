# faultier

## 2.2.2

### Patch Changes

- 7bb10fa: Improve README for new users with TL;DR example, Core Concepts glossary, self-contained Quick Start, Common Recipes, tabular API reference, and "When not to use Faultier" section

## 2.2.1

### Patch Changes

- 19c4383: Remove TypeScript peer dependency requirement

  Consumers no longer need to satisfy a `typescript` peer dependency. TypeScript is now a dev-only dependency of the package.

## 2.2.0

### Minor Changes

- 898b8c0: Add `toJSON()` method to `Fault` for automatic JSON serialization

  `JSON.stringify(fault)` now produces the same structured output as `toSerializable()`, so faults serialize cleanly in logs, API responses, and anywhere else `JSON.stringify` is called implicitly.

- a1db11e: Add `matchTag` and `matchTags` functions for union-driven tag matching

  Match error tags directly from a `Fault` union type without needing a registry. `matchTag` handles a single tag with an optional fallback, `matchTags` accepts a handler map keyed by tag. Both infer valid tags from the error type.

## 2.1.0

### Minor Changes

- 73087f0: Complete v2 rewrite. The v1 top-level API (`define`, `wrap`, `create`, `handle`, `assert`, `IS_FAULT`, `NO_FAULT_TAG`, `UNKNOWN`) is fully removed. `matchTag` and `matchTags` are now scoped to registry instances rather than standalone exports.

  ### New API
  - **`Fault`** — abstract base class with fluent `.withMessage()`, `.withDetails()`, `.withDescription()`, `.withMeta()`, `.withCause()` methods
  - **`Tagged(tag)<Fields>()`** — curried factory for creating typed Fault subclasses with a `_tag` discriminant
  - **`registry({ ...ctors })`** — creates scoped fault registries with `create`, `wrap().as`, `is`, `matchTag`, `matchTags`, `toSerializable`, `fromSerializable`
  - **`merge(a, b, ...rest)`** — combines registries with conflict detection; full type preservation across N registries via recursive conditional types
  - **`isFault`** — type guard for any Fault instance
  - **`fromSerializable`** — top-level generic deserialization

  ### Fault methods
  - **`withDescription(message, details?)`** — convenience setter for user-facing message and optional technical details in one call
  - **`flatten(options?)`** — configurable chain-to-string with `field: "message" | "details"` support. Replaces the removed `getIssue()` and `getDetails()` methods.
  - **`getContext()`** — merged metadata from the cause chain (head wins on conflicts). Renamed from `getFullMeta()`.
  - **`unwrap()`** — raw cause chain as an array
  - **`getTags()`** — `_tag` values from the cause chain

  ### Removed methods
  - `getIssue()` — use `flatten()` instead
  - `getDetails()` — use `flatten({ field: "details" })` instead
  - `getFullMeta()` — renamed to `getContext()`

  ### Serialization
  - Full round-trip serialization/deserialization with `__faultier: true` wire format
  - Nested Fault cause recursion, Error cause preservation, thrown value passthrough
  - Payload key collision handling (`__payload_` prefix for reserved key conflicts)
  - Depth guard on deserialization matching serialization (`MAX_CAUSE_DEPTH = 100`)

  ### Runtime safety
  - Max-depth guard (`MAX_CAUSE_DEPTH = 100`) on cause chain traversal in `unwrap()`, preventing stack overflow on circular causes
  - Same depth guard on `toSerializable()` and `fromSerializable()` paths
  - Safe `JSON.stringify` with try/catch fallback for circular objects

  ### Internal errors
  - `ReservedFieldError`, `RegistryTagMismatchError`, `RegistryMergeConflictError` — all extend Fault with static `_tag`

## 2.0.0

### Major Changes

- a55a947: ### Breaking changes
  - Registry model changed: module augmentation (`FaultRegistry`) and the default `Fault` class are gone. Migration: `import { define } from "faultier"`, define a registry type, then `class Fault extends define<Registry>() {}` and use that class for `create`, `wrap`, `handle`, `matchTag(s)`, etc.
  - Removed `faultier/extend` export and the `extend()` helper. Migration: add custom methods directly to your `Fault` class; `instanceof` works with your defined class.
  - Tag + context API simplified: `withContext` removed; use `Fault.create(tag, context?)` and `fault.withTag(tag, context?)`. Context can now be `undefined` when omitted, so update access to use optional chaining where needed.
  - Debug terminology renamed: `withDebug` → `withDetails`, `getDebug` → `getDetails`, `fault.debug` → `fault.details`, and serialized `debug` → `details`.
  - Serialization format changed: `toJSON()` now returns `SerializableFault` (same as `toSerializable()`), includes `_isFault`, `details`, `meta`, and nested `cause` objects. It no longer aggregates chain messages. Migration: call `Fault.getIssue()`/`Fault.getDetails()` for aggregated strings and update stored JSON to add `_isFault`, rename `debug` to `details`, and include `meta` if used.
  - Type exports changed: removed `FaultJSON`, `FaultRegistry`, `FaultTag`, `ContextForTag`. New/renamed exports: `TaggedFault`, `TagsOf`, `FaultContext`, `ChainFormattingOptions`. Update type imports and any `Tagged` usage.
  - `fault.name` now includes the tag (`Fault[TAG]`). Update any `name` checks or prefer `Fault.isFault()` or a class returned by `define()`.
  - Tagging/context updates now mutate the instance (no `TaggedFault` class cloning). If you relied on immutability, create fresh faults before branching.

  ### Migration example

  ```ts
  // Before
  import Fault from "faultier"

  declare module "faultier" {
    interface FaultRegistry {
      DATABASE_ERROR: { query: string }
      GENERIC_ERROR: never
    }
  }

  throw Fault.wrap(err).withTag("DATABASE_ERROR").withContext({ query: "SELECT 1" })

  // After
  import { define } from "faultier"

  type AppErrors = {
    DATABASE_ERROR: { query: string }
    GENERIC_ERROR: never
  }

  export class Fault extends define<AppErrors>() {}

  throw Fault.wrap(err).withTag("DATABASE_ERROR", { query: "SELECT 1" })
  ```

### Minor Changes

- 547cb32: Add fault metadata helpers with `withMeta`, `meta` getter, and `getFullMeta`, and include metadata in JSON and serializable output.

### Patch Changes

- 8224b71: Fix type resolution for package consumers by replacing internal path aliases with relative imports

  The generated `dist/index.d.ts` previously contained unresolved `#lib/*` path aliases, breaking type inference for consumers importing the package. Imports now use relative paths so declaration files resolve correctly.

- 81e6402: Remove default export and `BaseFault` in favor of named `define` export

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

## 1.1.1

### Patch Changes

- 5ba313b: Migrate tooling from Biome to Oxc (oxlint/oxfmt) with Adamantite presets and add Knip for dead code analysis

## 1.1.0

### Minor Changes

- b232ada: Add selective fault matching with `matchTag`, `matchTags`, and `isUnknown` methods

  **New Methods:**
  - **`Fault.matchTag(error, tag, callback)`** - Match a single fault tag and run a callback if it matches. Returns `UNKNOWN` if the error is not a fault or has a different tag. Use this when you only need to handle one specific fault type.

  - **`Fault.matchTags(error, handlers)`** - Match multiple fault tags with partial handlers. Unlike `handle()`, this only requires handlers for the tags you want to match, making it ideal for middleware and route-specific error handling. Returns `UNKNOWN` if the error is not a fault or no handler matches.

  - **`Fault.isUnknown(value)`** - Type guard to check if a match result is `UNKNOWN`. Use this to safely handle the results from `matchTag`, `matchTags`, or `handle` and narrow the return type.

  **Use Cases:**

  The new methods provide more flexibility than the existing exhaustive `handle()` method:
  - `matchTag` for single fault type handling in specific contexts
  - `matchTags` for partial matching in middleware or routes where you only care about certain fault types
  - `handle` remains for global error handlers that need to exhaustively handle all registered fault types
  - `isUnknown` for type-safe checks on match results

  **Example:**

  ```typescript
  // Single tag matching
  const result = Fault.matchTag(error, "DATABASE_ERROR", (fault) => {
    logger.error("DB error", fault.context.query)
    return { status: 500 }
  })

  // Multiple tag matching (partial)
  const result = Fault.matchTags(error, {
    NOT_FOUND: (fault) => ({ status: 404 }),
    AUTH_ERROR: (fault) => ({ status: 401 }),
    // Don't need handlers for all registered tags
  })

  // Type-safe result checking
  if (Fault.isUnknown(result)) {
    // Not a fault or unhandled tag - safe to handle differently
  }
  ```

  The README has been updated with comprehensive documentation for all three methods, including when to use each approach.

## 1.0.4

### Patch Changes

- 4591d32: Update development dependencies:
  - `@types/bun` from 1.3.1 to 1.3.5
  - `@types/yargs` from 17.0.34 to 17.0.35

  Apply code formatting improvements.

- b49aa0f: Enhance README documentation with improved structure and clarity

  **Documentation Improvements:**
  - **Added badges** displaying npm version, MIT license, and TypeScript 5.0+ compatibility for quick reference
  - **Added table of contents** in a collapsible section for easier navigation through the documentation
  - **Expanded installation instructions** with examples for npm, yarn, pnpm, and bun package managers
  - **Enhanced Quick Start section** with more descriptive comments explaining the dual-message feature (debug vs user-facing messages)
  - **Improved Type Safety section** with clearer explanation of module augmentation and its purpose
  - **Added detailed explanations** for error chaining methods (`unwrap()`, `flatten()`, `getTags()`, `getFullContext()`) with inline comments showing what each method returns
  - **Added Contributing section** linking to CONTRIBUTING.md guidelines

  These changes improve developer onboarding and make the documentation more accessible without affecting any package functionality.

- b3dd2ae: Fix context type safety for tagged faults by introducing partial context types

  **Context Type System Improvements:**
  - **Added `PartialContextForTag<T>` type** to correctly represent context that may or may not be present on a tagged fault. When you call `.withTag()` without `.withContext()`, the fault now correctly has an empty context object (`{}`) typed as `Partial<ContextForTag<T>>`.

  - **Simplified type hierarchy** by consolidating `FaultWithContext` and `FaultWithTag` into a single `TaggedFault` class. Both `withContext()` and `clearContext()` are now available on all tagged faults, eliminating the need for separate type branches.

  - **Improved type narrowing** after `isFault()` checks. When checking `fault.tag === "MY_TAG"`, TypeScript now correctly narrows the context type to `Partial<{ ... }>`, allowing safe property access with optional chaining or `in` checks.

  **Extended Fault API Changes:**
  - Renamed `ExtendedFaultWithTag` → `ExtendedTaggedFault` for consistency
  - Removed `ExtendedFaultWithContext` type (merged into `ExtendedTaggedFault`)
  - Both extended and core faults now follow the same type patterns

  **Migration:**

  Existing code continues to work without changes. The improvements primarily enhance type safety and eliminate false positive TypeScript errors when working with fault chains and context properties.

  **Before:**

  ```typescript
  const fault = Fault.create("MY_TAG")
  // TypeScript error: context type was `never` even though it's actually `{}`
  if ("requestId" in fault.context) { ... }
  ```

  **After:**

  ```typescript
  const fault = Fault.create("MY_TAG")
  // No error: context is correctly typed as Partial<{ requestId: string }>
  if ("requestId" in fault.context) {
    // TypeScript knows fault.context.requestId is string | undefined
    console.log(fault.context.requestId)
  }
  ```

## 1.0.3

### Patch Changes

- d42ee7e: Add JSDoc documentation for `Fault.assert()` method with usage example

## 1.0.2

### Patch Changes

- ec009f2: Export extended fault type interfaces for improved TypeScript developer experience

  Exports previously internal TypeScript interfaces and types from the `extend()` functionality to improve type inference and IDE autocomplete when working with extended faults:
  - `FaultRegistry` - Now exported from main package entry for module augmentation
  - `WithBaseFaultMethods` - Helper type ensuring extended faults have BaseFault methods
  - `ExtendedFaultBase` - Base extended fault interface before `.withTag()` is called
  - `ExtendedFaultWithTag` - Extended fault interface after calling `.withTag()`
  - `ExtendedFaultWithContext` - Extended fault interface after calling `.withContext()`

  The `extend()` function now has explicit return types providing better TypeScript support throughout the fault creation and transformation chain.

  **Critical fix:** Enable TypeScript declaration splitting (`dts.splitting: true`) to resolve module augmentation type recognition issue. Previously, when using `declare module "faultier"` to extend the `FaultRegistry` interface, extended faults created with `extend()` weren't properly recognizing the augmented types because the generated `.d.ts` files weren't importing the `FaultRegistry` type from its own module - they were duplicating the type definition inline. With declaration splitting enabled, the build now correctly generates imports like `import type { FaultRegistry } from './types'`, ensuring that module augmentation properly applies to all extended fault types.

  **Build improvements:**
  - Enable TypeScript declaration splitting for better tree-shaking of type imports and correct module augmentation behavior
  - Add automatic output directory cleaning before builds to prevent stale artifacts

  This change is purely additive and improves the developer experience without affecting runtime behavior.

## 1.0.1

### Patch Changes

- a4f13a8: Improve README documentation structure by reorganizing sections under a parent "Usage" heading for better navigation and clarity

## 1.0.0

### Major Changes

- 39aebea: Refactor internal architecture and simplify FaultRegistry type system

  **Breaking Changes**
  1. **Simplified FaultRegistry interface**: The `FaultRegistry` interface now directly maps tag names to their context types, eliminating the separate `tags` and `context` properties for a more intuitive API.

     **Before:**

     ```ts
     declare module "faultier" {
       interface FaultRegistry {
         tags: "DATABASE_ERROR" | "AUTH_ERROR"
         context: {
           DATABASE_ERROR: { query: string }
           AUTH_ERROR: { userId: string }
         }
       }
     }
     ```

     **After:**

     ```ts
     declare module "faultier" {
       interface FaultRegistry {
         DATABASE_ERROR: { query: string }
         AUTH_ERROR: { userId: string }
         GENERIC_ERROR: never // Use 'never' to prevent withContext()
       }
     }
     ```

     **Benefits:**
     - More concise and easier to read
     - Supports extending with grouped error types using TypeScript's `extends` keyword
     - Better type inference with `never` for tags without context (prevents `withContext()` at type level)
     - Eliminates redundancy between tag union and context mapping

  2. **Internal structure reorganized**: Core implementation moved from `src/` to `src/lib/` directory. This is transparent to users importing from the main package entry point.

  3. **Simplified type exports**: Streamlined exported types to public API essentials:
     - **Removed exports**: `ChainFormattingOptions`, `FaultRegistry` (internal implementation details)
     - **Added exports**: `ContextForTag`, `FaultJSON`, `FaultTag` (type-safe registry utilities)
     - **Unchanged exports**: `SerializableError`, `SerializableFault`

  4. **New package export**: Added `faultier/extend` export providing the `extend()` function as a standalone entry point for extending custom Error classes with Fault functionality.

  5. **TypeScript peer dependency**: Locked to specific version `5.9.3` (previously `^5`). This ensures consistent type behavior across installations.

  **Migration Guide**

  **Updating your FaultRegistry (REQUIRED):**

  All projects using custom tags must update their module augmentation:

  ```ts
  // Old format (0.3.x and earlier)
  declare module "faultier" {
    interface FaultRegistry {
      tags: "MY_TAG" | "OTHER_TAG"
      context: {
        MY_TAG: { foo: string }
        OTHER_TAG: { bar: number }
      }
    }
  }

  // New format (0.4.x and later)
  declare module "faultier" {
    interface FaultRegistry {
      MY_TAG: { foo: string }
      OTHER_TAG: { bar: number }
    }
  }
  ```

  For tags that don't need context, use `never`:

  ```ts
  declare module "faultier" {
    interface FaultRegistry {
      WITH_CONTEXT: { data: string }
      NO_CONTEXT: never // TypeScript will prevent .withContext() calls
    }
  }
  ```

  For larger applications, group related errors:

  ```ts
  type DatabaseErrors = {
    DB_CONNECTION_ERROR: { host: string; port: number }
    DB_QUERY_ERROR: { query: string; table: string }
  }

  type AuthErrors = {
    AUTH_INVALID_TOKEN: { token: string }
    AUTH_EXPIRED_SESSION: { sessionId: string }
  }

  declare module "faultier" {
    interface FaultRegistry extends DatabaseErrors, AuthErrors {
      GENERIC_ERROR: never
    }
  }
  ```

  **If you were importing removed types:**
  - `FaultRegistry` - This was never meant to be imported directly. Use module augmentation as shown above.

  - `ChainFormattingOptions` - This type was internal. The options are passed directly to methods like `BaseFault.getIssue()` and don't need to be imported.

  **New: Standalone extend() export**

  You can now import `extend()` directly from `faultier/extend`:

  ```ts
  import { extend } from "faultier/extend"

  class HttpError extends Error {
    constructor(
      message: string,
      public statusCode: number
    ) {
      super(message)
    }
  }

  const HttpFault = extend(HttpError)
  ```

  **New Features**
  - **Type-safe prevention of withContext()**: Tags with `never` context type now properly prevent `withContext()` calls at compile time, returning `never` type
  - **Improved handler typing**: `Fault.handle()` now correctly types handlers based on whether tags require context or not
  - **Better type inference**: `ContextForTag<T>` utility type now properly handles `never` for tags without context
  - **Documentation improvements**: Added examples of grouping error types for larger applications and using `never` to prevent context
  - Dedicated `./extend` export for cleaner imports of the `extend()` function
  - Improved internal organization for better maintainability
  - Added `withDebug(debug)` method to set only the debug message
  - Added `withMessage(message)` method to set only the user-facing message

  **Bug Fixes**
  - Fixed `IS_FAULT` symbol being lost after calling `clearContext()` on extended faults. The symbol is now properly preserved using `Object.defineProperty()` with non-enumerable configuration, ensuring `Fault.isFault()` checks work correctly throughout the fault's lifecycle.
  - Fixed stack traces being lost when calling `withTag()` or `withContext()` on extended faults. Stack traces now correctly point to the original fault creation location rather than where transformation methods were called, improving debuggability.
  - Improved type safety for `IS_FAULT` and `UNKNOWN` symbols by declaring them as `unique symbol` types instead of plain `symbol`, preventing accidental symbol collisions.

  **Internal Changes**
  - Deleted `src/core.ts` in favor of reorganized `src/lib/index.ts`
  - Moved all tests to `src/lib/__tests__/` directory
  - Updated build configuration to support multiple entry points
  - Refactored `IS_FAULT` symbol initialization to use `Object.defineProperty()` in constructors instead of class field initialization
  - Added `WithIsFault` type helper for safer symbol property access in type guards

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
  import { getIssue, getDebug } from "faultier"

  const issue = getIssue(fault)
  const debug = getDebug(fault, " | ")
  const flat = fault.flatten(" -> ")
  ```

  After:

  ```ts
  import { BaseFault } from "faultier"

  const issue = BaseFault.getIssue(fault)
  const debug = BaseFault.getDebug(fault, { separator: " | " })
  const flat = fault.flatten({ separator: " -> " })
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
  BaseFault.getDebug(fault, { formatter: (msg) => msg.toUpperCase() })
  // "DEBUG MESSAGE ANOTHER DEBUG MESSAGE"

  // Flatten with custom options
  fault.flatten({ separator: " → ", formatter: (msg) => `[${msg}]` })
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
    .withContext({ endpoint: "/users", status: 500 })

  // Serialize for transmission
  const serialized = BaseFault.toSerializable(original)
  const json = JSON.stringify(serialized)

  // Deserialize on the other side
  const parsed = JSON.parse(json)
  const restored = Fault.fromSerializable(parsed)

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
