---
"faultier": minor
---

Add selective fault matching with `matchTag`, `matchTags`, and `isUnknown` methods

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
  logger.error("DB error", fault.context.query);
  return { status: 500 };
});

// Multiple tag matching (partial)
const result = Fault.matchTags(error, {
  NOT_FOUND: (fault) => ({ status: 404 }),
  AUTH_ERROR: (fault) => ({ status: 401 }),
  // Don't need handlers for all registered tags
});

// Type-safe result checking
if (Fault.isUnknown(result)) {
  // Not a fault or unhandled tag - safe to handle differently
}
```

The README has been updated with comprehensive documentation for all three methods, including when to use each approach.
