---
"faultier": minor
---

Add fault serialization and deserialization for network transport

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
