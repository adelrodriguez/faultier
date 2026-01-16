/**
 * Type helpers for Faultier.
 *
 * Design goals:
 * - Keep the public surface **small and readable**.
 * - Preserve **subclass methods** by composing types with `InstanceType<typeof Fault>`.
 * - Provide an ergonomic return-type helper: `Faultier.Tagged<typeof Fault, "tag">`.
 */

// Phantom brand symbol for preserving tag type through method chains
declare const TagBrand: unique symbol

/**
 * Internal brand used by tagged faults.
 * Exported as a type (not a value) so consumers never interact with the symbol directly.
 */
export type TagBrand<TTag extends string> = {
  readonly [TagBrand]: TTag
}

type AnyConstructor = abstract new (
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
 */
export type FaultContext<
  TFaultClass extends AnyConstructor,
  TTag extends TagsOf<TFaultClass>,
> = Partial<RegistryOf<TFaultClass>[TTag]>

/**
 * A Fault instance with a specific tag and tag-specific context type.
 * Preserves subclass methods because it intersects with `InstanceType<TFaultClass>`.
 *
 * @example
 * ```ts
 * type MyRegistry = { "db.error": { query: string } }
 * class Fault extends Faultier.define<MyRegistry>() {}
 *
 * function dbOperation(): Faultier.Tagged<typeof Fault, "db.error"> {
 *   return Fault.create("db.error").withContext({ query: "SELECT *" })
 * }
 * ```
 */
export type Tagged<
  TFaultClass extends AnyConstructor,
  TTag extends TagsOf<TFaultClass>,
> = InstanceType<TFaultClass> &
  TagBrand<TTag> & {
    readonly tag: TTag
    readonly context: FaultContext<TFaultClass, TTag>
  }

/**
 * Options for formatting fault chain messages in methods like getIssue, getDebug, and flatten.
 */
export type ChainFormattingOptions = {
  /** Separator used to join messages from the fault chain */
  separator?: string
  /** Function to format each message before joining */
  formatter?: (message: string) => string
}

export type FaultJSON<
  TTag extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
> = {
  name: string
  tag: TTag
  message: string
  debug?: string
  context: TContext
  cause?: string
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
  name: string
  tag: string
  message: string
  debug?: string
  context: Record<string, unknown>
  cause?: SerializableFault | SerializableError
}
