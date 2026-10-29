/**
 * Base abstract fault class.
 *
 * Extend directly or use {@link Tagged} to define tagged subclasses.
 */
export { Fault } from "./lib/fault"

/**
 * Type guard for Fault instances.
 *
 * Uses `instanceof Fault` and therefore is not cross-realm safe.
 * Use serialization/deserialization when crossing process/realm boundaries.
 */
export { isFault } from "./lib/fault"

/**
 * Finds the first node in a fault's cause chain, head included, that is an
 * instance of the given class. Returns `undefined` for non-Fault values.
 *
 * Use `registry.findCause` to find a registered fault by tag.
 */
export { findCause } from "./lib/fault"

/**
 * Factory for creating tagged Fault subclasses.
 *
 * The two calls allow the tag and field types to be inferred independently.
 *
 * @example
 * ```ts
 * import * as Faultier from "faultier"
 *
 * class NotFoundError extends Faultier.Tagged("NotFoundError")<{ resource: string }>() {}
 * const error = new NotFoundError({ resource: "user" })
 * ```
 */
export { Tagged } from "./lib/tagged"

/**
 * Creates a fault registry from tagged constructors.
 *
 * Registries provide creation, wrapping, matching, and (de)serialization helpers
 * scoped to the registered fault union.
 *
 * @example
 * ```ts
 * import * as Faultier from "faultier"
 *
 * class TimeoutError extends Faultier.Tagged("TimeoutError")() {}
 * const AppFault = Faultier.registry({ TimeoutError })
 *
 * const wrapped = AppFault.wrap(new Error("root")).as("TimeoutError")
 * ```
 */
export { registry } from "./lib/registry"

/**
 * Merges multiple fault registries into one.
 *
 * Throws `RegistryMergeConflictError` from `faultier/errors` when duplicate tags map to
 * different constructors.
 */
export { merge } from "./lib/registry"

/**
 * Standalone union-driven tag matcher for a single tag.
 */
export { matchTag } from "./lib/match"

/**
 * Standalone union-driven tag matcher using a handler map.
 */
export { matchTags } from "./lib/match"

/**
 * Serializes any caught value to the wire format.
 *
 * Faults encode themselves; native `Error`s become `UnknownError` and any other
 * thrown value becomes `UnknownThrown`.
 */
export { toSerializable } from "./lib/fault"

/**
 * Deserializes a generic fault from the wire format.
 *
 * Use `registry.fromSerializable` when you want subclass reconstruction for registered tags.
 */
export { fromSerializable } from "./lib/reviver"

/**
 * Type guard for wire payloads.
 *
 * Returns `true` only when the value's envelope fields and cause chain match
 * `SerializableFault`, so `fromSerializable` will accept it. Payload and `meta`
 * values are not deep-validated. Use it to check data received over RPC or HTTP.
 */
export { isSerializableFault } from "./lib/reviver"
