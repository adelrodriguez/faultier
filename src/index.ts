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
 * Factory for creating tagged Fault subclasses.
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
 * Throws {@link RegistryMergeConflictError} when duplicate tags map to different constructors.
 */
export { merge } from "./lib/merge"

/**
 * Standalone union-driven tag matcher for a single tag.
 */
export { matchTag } from "./lib/match"

/**
 * Standalone union-driven tag matcher using a handler map.
 */
export { matchTags } from "./lib/match"

/**
 * Deserializes a generic fault from the wire format.
 *
 * Use `registry.fromSerializable` when you want subclass reconstruction for registered tags.
 */
export { fromSerializable } from "./lib/serialize"

/**
 * Thrown when Tagged constructor fields include a reserved property/method name.
 */
export { ReservedFieldError } from "./lib/errors"

/**
 * Thrown when a registry key does not match a constructor's static `_tag`.
 */
export { RegistryTagMismatchError } from "./lib/errors"

/**
 * Thrown when merging registries that share a tag but have different constructors.
 */
export { RegistryMergeConflictError } from "./lib/errors"

/**
 * Type-only API for registry instances created by {@link registry}.
 */
export type { FaultRegistry } from "./lib/registry"

/**
 * Field selector for `flatten`.
 */
export type { FlattenField } from "./lib/fault"

/**
 * Options shared by `flatten`.
 */
export type { FlattenOptions } from "./lib/fault"

/**
 * Tag discriminant extracted from a Fault union.
 */
export type { TagOf } from "./lib/match"

/**
 * Extracts the member of a Fault union for a specific tag.
 */
export type { ByTag } from "./lib/match"

/**
 * Serializable fault payload shape.
 */
export type { SerializableFault } from "./lib/fault"

/**
 * Serializable cause union for nested fault/error/thrown values.
 */
export type { SerializableCause } from "./lib/fault"
