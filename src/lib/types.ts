/**
 * Type helpers for Faultier.
 *
 * Design goals:
 * - Keep the public surface **small and readable**.
 * - Preserve **subclass methods** by composing types with `InstanceType<typeof Fault>`.
 * - Provide an ergonomic return-type helper: `Faultier.TaggedFault<typeof Fault, "tag">`.
 */

type TaggedMarker = { readonly __tagged: true }
export type Untagged<T> = T extends TaggedMarker ? never : T

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
 * - Optional tags (`TAG?: { ... }`) yield `T | undefined`
 * - `never` tags yield `undefined`
 */
type NormalizeContext<T> = [T] extends [never] ? undefined : T

export type ContextMap<TRegistry> = {
  [K in keyof TRegistry]: NormalizeContext<TRegistry[K]>
}

export type FaultContext<
  TFaultClass extends AnyConstructor,
  TTag extends TagsOf<TFaultClass>,
> = ContextMap<RegistryOf<TFaultClass>>[TTag]

/**
 * A Fault instance with a specific tag and tag-specific context type.
 * Preserves subclass methods because it intersects with `InstanceType<TFaultClass>`.
 *
 * @example
 * ```ts
 * type MyRegistry = { "db.error": { query: string } }
 * class Fault extends Faultier.define<MyRegistry>() {}
 *
 * function dbOperation(): Faultier.TaggedFault<typeof Fault, "db.error"> {
 *   return Fault.create("db.error", { query: "SELECT *" })
 * }
 * ```
 */
export type TaggedBase<TBase, TTag extends string, TContext> = TBase &
  TaggedMarker & {
    readonly tag: TTag
    readonly context: TContext
  }

export type TaggedFault<
  TFaultClass extends AnyConstructor,
  TTag extends TagsOf<TFaultClass>,
> = TaggedBase<InstanceType<TFaultClass>, TTag, FaultContext<TFaultClass, TTag>>

/**
 * Options for formatting fault chain messages in methods like getIssue, getDetail, and flatten.
 */
export type ChainFormattingOptions = {
  /** Separator used to join messages from the fault chain */
  separator?: string
  /** Function to format each message before joining */
  formatter?: (message: string) => string
}

export type FaultJSON<
  TTag extends string = string,
  TContext extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = {
  name: string
  tag: TTag
  message: string
  detail?: string
  cause?: string
} & ([TContext] extends [never]
  ? { context?: undefined }
  : undefined extends TContext
    ? { context?: Exclude<TContext, undefined> }
    : { context: TContext })

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
export type SerializableFault = {
  _isFault: true
  name: string
  tag: string
  message: string
  detail?: string
  context?: Record<string, unknown>
  cause?: SerializableFault | SerializableError
}
