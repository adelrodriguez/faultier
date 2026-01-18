// Phantom brand symbol for preserving tag type through method chains
declare const TagBrand: unique symbol

/**
 * Minimal interface for objects that can be used with static methods like getIssue, getDetails.
 * This allows extended faults to work with these methods.
 */
export interface FaultLike {
  unwrap(): Error[]
}

/**
 * Internal brand used by tagged faults.
 * Exported as a type (not a value) so consumers never interact with the symbol directly.
 */
export type TagBrand<TTag extends string> = {
  readonly [TagBrand]: TTag
}

export type AnyConstructor = abstract new (
  // oxlint-disable-next-line typescript/no-explicit-any
  ...args: any[]
  // oxlint-disable-next-line typescript/no-explicit-any
) => any

/**
 * Extracts the registry type from a Fault class created by `define()`.
 */
type RegistryOf<TFaultClass extends AnyConstructor> = TFaultClass extends {
  readonly __faultierRegistry?: infer R
}
  ? R
  : never

/**
 * Extracts the tag union from a Fault class created by `define()`.
 */
export type TagsOf<TFaultClass extends AnyConstructor> = keyof RegistryOf<TFaultClass> & string

/**
 * Extracts the context type for a tag from a Fault class created by `define()`.
 * Returns `T | undefined` when all properties are optional, `T` when there are required properties.
 */
export type FaultContext<
  TFaultClass extends AnyConstructor,
  TTag extends TagsOf<TFaultClass>,
  // oxlint-disable-next-line typescript/no-empty-object-type
> = {} extends RegistryOf<TFaultClass>[TTag]
  ? RegistryOf<TFaultClass>[TTag] | undefined
  : RegistryOf<TFaultClass>[TTag]

/**
 * Conditional context parameter for withTag/create methods.
 * - If T is `never`: no context allowed (empty tuple)
 * - If all properties in T are optional: context is optional
 * - If T has required properties: context is required
 */
// oxlint-disable-next-line typescript/no-empty-object-type
export type ContextParam<T> = [T] extends [never]
  ? []
  : // oxlint-disable-next-line typescript/no-empty-object-type
    {} extends T
    ? [context?: T]
    : [context: T]

/**
 * A Fault instance with a specific tag and tag-specific context type.
 * Preserves subclass methods because it intersects with the instance type.
 *
 * @example
 * ```ts
 * import Faultier, { type TaggedFault, type TagsOf, type FaultContext } from "faultier"
 *
 * type Registry = { "db.error": { query: string }, "not.found": {} }
 * class Fault extends Faultier.define<Registry>() {}
 *
 * // Create local alias using TaggedFault
 * type FaultTagged<T extends TagsOf<typeof Fault>> =
 *   TaggedFault<Fault, T, FaultContext<typeof Fault, T>>
 *
 * function dbOperation(): FaultTagged<"db.error"> {
 *   return Fault.create("db.error", { query: "SELECT *" })
 * }
 * ```
 */
export type TaggedFault<TFaultInstance, TTag extends string, TContext = unknown> = TFaultInstance &
  TagBrand<TTag> & {
    readonly tag: TTag
    readonly context: TContext
  }

/**
 * Options for formatting fault chain messages in methods like getIssue, getDetails, and flatten.
 */
export type ChainFormattingOptions = {
  /** Separator used to join messages from the fault chain */
  separator?: string
  /** Function to format each message before joining */
  formatter?: (message: string) => string
}

/**
 * Serialized representation of a plain Error (non-Fault).
 */
export interface SerializableError {
  name: string
  message: string
}

/**
 * Serialized representation of a Fault with full error chain support.
 * Unlike FaultJSON, this preserves the entire cause chain as nested objects.
 */
export interface SerializableFault {
  _isFault: true
  name: string
  tag: string
  message: string
  details?: string
  context?: Record<string, unknown>
  meta?: Record<string, unknown>
  cause?: SerializableFault | SerializableError
}
