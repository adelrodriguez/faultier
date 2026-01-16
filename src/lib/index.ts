import type {
  ChainFormattingOptions,
  ContextParam,
  FaultJSON,
  FaultLike,
  TagBrand,
  SerializableError,
  SerializableFault,
} from "#lib/types.ts"
import { HAS_PUNCTUATION } from "#lib/utils.ts"

const defaultTrimFormatter = (msg: string) => msg.trim()

export const IS_FAULT: unique symbol = Symbol("IS_FAULT")
export const UNKNOWN: unique symbol = Symbol("UNKNOWN")
export const NO_FAULT_TAG = "No fault tag set" as const

type WithIsFault = {
  readonly [IS_FAULT]: true
}

/**
 * Creates a typed Fault class based on the provided registry type.
 *
 * @example
 * ```ts
 * type MyRegistry = {
 *   "auth.unauthenticated": { requestId?: string }
 *   "db.connection_failed": { host: string; port: number }
 * }
 *
 * export const Fault = defineFault<MyRegistry>()
 *
 * // Now fully typed - context required when registry has required properties:
 * Fault.create("db.connection_failed", { host: "localhost", port: 5432 })
 *
 * // Context optional when all properties are optional:
 * Fault.create("auth.unauthenticated")
 * Fault.create("auth.unauthenticated", { requestId: "123" })
 * ```
 */
export function define<TRegistry extends Record<string, Record<string, unknown>>>() {
  type Tag = keyof TRegistry & string

  type HandlerReturnUnion<THandlers> = {
    [K in keyof THandlers]-?: THandlers[K] extends (
      // oxlint-disable-next-line typescript/no-explicit-any
      ...args: any[]
    ) => infer R
      ? R
      : never
  }[keyof THandlers]

  class FaultBase extends Error {
    /**
     * Type-only hook so public helpers like `Faultier.Tags<typeof Fault>` can extract
     * the registry type from a Fault class returned by `define()`.
     *
     * This is not emitted at runtime.
     */
    declare static readonly __faultierRegistry?: TRegistry

    protected _tag: string = NO_FAULT_TAG
    protected _context?: Record<string, unknown>
    protected _debug?: string
    protected _meta?: Record<string, unknown>

    get tag(): Tag | typeof NO_FAULT_TAG {
      return this._tag as Tag | typeof NO_FAULT_TAG
    }

    get context(): unknown {
      return this._context
    }

    get debug(): string | undefined {
      return this._debug
    }

    get meta(): Record<string, unknown> | undefined {
      return this._meta
    }

    declare cause?: Error

    constructor(message?: string, options?: ErrorOptions) {
      super(message, options)
      this.name = "Fault"
      Object.defineProperty(this, IS_FAULT, {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false,
      })
    }

    /**
     * Sets the tag and context for this fault.
     * Context is required if the registry defines required properties for this tag.
     */
    withTag<T extends Tag>(tag: T, ...args: ContextParam<TRegistry[T]>): Tagged<this, T> {
      this._tag = tag
      this._context = args[0] as Record<string, unknown> | undefined
      return this as unknown as Tagged<this, T>
    }

    /**
     * Sets debug and/or user-facing messages for this fault.
     */
    withDescription(debug: string, message?: string): this {
      this._debug = debug
      if (message !== undefined) {
        this.message = message
      }
      return this
    }

    /**
     * Sets only the debug message for this fault.
     */
    withDebug(debug: string): this {
      this._debug = debug
      return this
    }

    /**
     * Merges metadata into this fault.
     */
    withMeta(meta: Record<string, unknown>): this {
      this._meta = { ...this._meta, ...meta }
      return this
    }

    /**
     * Sets only the user-facing message for this fault.
     */
    withMessage(message: string): this {
      this.message = message
      return this
    }

    /**
     * Gets the full error chain from this fault, including all causes.
     */
    unwrap(): Error[] {
      const chain: Error[] = [this]

      let current = this.cause

      while (current) {
        if (IS_FAULT in current) {
          chain.push(current)
          current = (current as unknown as FaultBase).cause
        } else {
          break
        }
      }

      if (current) {
        chain.push(current)
      }

      return chain
    }

    /**
     * Flattens all messages from the fault chain into a single string.
     * Duplicate consecutive messages are automatically skipped.
     */
    flatten(options?: ChainFormattingOptions): string {
      const { separator = " -> ", formatter = defaultTrimFormatter } = options ?? {}

      const chain = this.unwrap()
      const messages: string[] = []
      let lastMessage: string | undefined

      for (const err of chain) {
        const formatted = formatter(err.message)
        if (formatted !== lastMessage) {
          messages.push(formatted)
          lastMessage = formatted
        }
      }

      return messages.join(separator)
    }

    /**
     * Gets all tags from faults in the error chain.
     * Only includes tags from Fault instances, not raw Error objects.
     */
    getTags(): string[] {
      const chain = this.unwrap()
      return chain.filter((e): e is FaultBase => IS_FAULT in e).map((fault) => fault.tag)
    }

    /**
     * Gets the merged context from all faults in the error chain.
     * Contexts are merged from root cause to current fault, with later
     * faults overriding earlier ones for duplicate keys.
     */
    getFullContext(): Record<string, unknown> {
      const chain = this.unwrap()
      const faults = chain.filter((e): e is FaultBase => IS_FAULT in e)
      const merged: Record<string, unknown> = {}

      for (const fault of faults.toReversed()) {
        Object.assign(merged, fault.context)
      }

      return merged
    }

    /**
     * Gets the merged meta from all faults in the error chain.
     * Meta is merged from root cause to current fault, with later
     * faults overriding earlier ones for duplicate keys.
     */
    getFullMeta(): Record<string, unknown> {
      const chain = this.unwrap()
      const faults = chain.filter((e): e is FaultBase => FaultBase.isFault(e))
      const merged: Record<string, unknown> = {}

      for (const fault of faults.toReversed()) {
        Object.assign(merged, fault.meta ?? {})
      }

      return merged
    }

    /**
     * Converts this fault to a JSON-serializable object.
     */
    toJSON(): FaultJSON {
      const meta = this.meta
      return {
        cause: this.cause?.message,
        context: this.context as Record<string, unknown> | undefined,
        debug: FaultBase.getDebug(this, { separator: " → " }),
        message: FaultBase.getIssue(this, { separator: " → " }),
        ...(meta === undefined ? {} : { meta }),
        name: this.name,
        tag: this.tag,
      }
    }

    // --- Static methods ---

    /**
     * Creates a new Fault with the specified tag and context.
     * Context is required if the registry defines required properties for this tag.
     * Uses polymorphic `this` so extended classes return their own type with custom methods.
     */
    static create<T extends Tag, This extends typeof FaultBase>(
      this: This,
      tag: T,
      ...args: ContextParam<TRegistry[T]>
    ): Tagged<InstanceType<This>, T> {
      const instance = new this()
      instance._tag = tag
      instance._context = args[0] as Record<string, unknown> | undefined
      return instance as unknown as Tagged<InstanceType<This>, T>
    }

    /**
     * Wraps an unknown error into a Fault instance.
     * Uses polymorphic `this` so extended classes return their own type.
     */
    static wrap<This extends typeof FaultBase>(this: This, error: unknown): InstanceType<This> {
      const cause = error instanceof Error ? error : new Error(String(error))
      const instance = new this(cause.message, { cause })
      return instance as InstanceType<This>
    }

    /**
     * Checks if a value is a Fault instance.
     */
    static isFault(value: unknown): value is FaultBase {
      if (typeof value !== "object" || value === null) {
        return false
      }
      return IS_FAULT in value && (value as WithIsFault)[IS_FAULT]
    }

    /**
     * Checks if a match result is UNKNOWN (not a fault or no handler matched).
     */
    static isUnknown(value: unknown): value is typeof UNKNOWN {
      return value === UNKNOWN
    }

    /**
     * Asserts that the given error is a Fault instance.
     */
    static assert(error: unknown): asserts error is FaultBase {
      if (!FaultBase.isFault(error)) {
        throw error
      }
    }

    /**
     * Searches the error chain for a cause matching the given Error class.
     * Returns the first matching error, or undefined if not found.
     */
    static findCause<T extends Error>(
      error: unknown,
      // oxlint-disable-next-line typescript/no-explicit-any
      ErrorClass: new (...args: any[]) => T
    ): T | undefined {
      if (!(error instanceof Error)) {
        return undefined
      }

      let current: Error | undefined = error
      while (current) {
        if (current instanceof ErrorClass) {
          return current
        }
        current = current.cause instanceof Error ? current.cause : undefined
      }
      return undefined
    }

    /**
     * Matches a fault against a single tag.
     */
    static matchTag<TTag extends Tag, TResult>(
      error: unknown,
      tag: TTag,
      callback: (fault: Tagged<FaultBase, TTag>) => TResult
    ): TResult | typeof UNKNOWN {
      if (!FaultBase.isFault(error)) {
        return UNKNOWN
      }

      if (error.tag === tag) {
        return callback(error as unknown as Tagged<FaultBase, TTag>)
      }

      return UNKNOWN
    }

    /**
     * Matches a fault against multiple tags.
     */
    static matchTags<
      THandlers extends {
        [K in Tag]?: (fault: Tagged<FaultBase, K>) => unknown
      },
    >(error: unknown, handlers: THandlers): HandlerReturnUnion<THandlers> | typeof UNKNOWN {
      if (!FaultBase.isFault(error)) {
        return UNKNOWN
      }

      const handler = handlers[error.tag as keyof THandlers]

      if (handler) {
        // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-return, typescript/no-unsafe-call
        return (handler as any)(error)
      }

      return UNKNOWN
    }

    /**
     * Exhaustively dispatches a fault to handlers for all registered tags.
     */
    static handle<
      H extends {
        // oxlint-disable-next-line typescript/no-explicit-any
        [T in Tag]: (fault: Tagged<FaultBase, T>) => any
      },
    >(error: unknown, handlers: H): HandlerReturnUnion<H> | typeof UNKNOWN {
      if (!FaultBase.isFault(error)) {
        return UNKNOWN
      }

      const handler = handlers[error.tag as Tag]

      if (handler) {
        // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-return, typescript/no-unsafe-argument
        return handler(error as any)
      }

      return UNKNOWN
    }

    /**
     * Serializes a fault and its entire error chain into a plain object.
     */
    static toSerializable(fault: FaultBase): SerializableFault {
      const meta = fault.meta
      const serialized: SerializableFault = {
        context: fault.context as Record<string, unknown> | undefined,
        debug: fault.debug,
        message: fault.message,
        name: fault.name,
        tag: fault.tag,
        ...(meta === undefined ? {} : { meta }),
      }

      if (fault.cause) {
        if (FaultBase.isFault(fault.cause)) {
          serialized.cause = FaultBase.toSerializable(fault.cause)
        } else {
          serialized.cause = {
            message: fault.cause.message,
            name: fault.cause.name,
          } satisfies SerializableError
        }
      }

      return serialized
    }

    /**
     * Deserializes a fault from a serialized representation, reconstructing
     * the entire error chain.
     */
    static fromSerializable<This extends typeof FaultBase>(
      this: This,
      data: SerializableFault | SerializableError
    ): InstanceType<This> {
      const reconstructCause = (
        causeData: SerializableFault | SerializableError | undefined
      ): Error | undefined => {
        if (!causeData) {
          return undefined
        }

        if ("tag" in causeData) {
          return FaultBase.fromSerializable.call(this, causeData) as Error
        }

        const error = new Error(causeData.message)
        error.name = causeData.name
        return error
      }

      if (!("tag" in data)) {
        throw new Error("Cannot deserialize SerializableError as Fault. Top-level must be a Fault.")
      }

      if (typeof data.name !== "string") {
        throw new Error("Invalid serialized fault: 'name' must be a string")
      }
      if (typeof data.message !== "string") {
        throw new Error("Invalid serialized fault: 'message' must be a string")
      }
      if (typeof data.tag !== "string") {
        throw new Error("Invalid serialized fault: 'tag' must be a string")
      }
      if (
        data.context !== undefined &&
        (typeof data.context !== "object" || data.context === null)
      ) {
        throw new Error("Invalid serialized fault: 'context' must be an object or undefined")
      }

      if (data.meta !== undefined && (typeof data.meta !== "object" || data.meta === null)) {
        throw new Error("Invalid serialized fault: 'meta' must be an object or undefined")
      }

      const cause = reconstructCause(data.cause)
      const instance = new this(data.message, { cause })
      instance._tag = data.tag
      instance._context = data.context
      instance._debug = data.debug
      instance._meta = data.meta

      return instance as InstanceType<This>
    }

    /**
     * Extracts all user-facing messages from the fault chain.
     */
    static getIssue(fault: FaultLike, options?: Partial<ChainFormattingOptions>): string {
      const {
        separator = " ",
        formatter = (msg: string) => {
          const trimmed = msg.trim()
          if (!trimmed) return ""
          return HAS_PUNCTUATION.test(trimmed) ? trimmed : `${trimmed}.`
        },
      } = options ?? {}

      return fault
        .unwrap()
        .filter((e): e is FaultBase => FaultBase.isFault(e))
        .map((err) => formatter(err.message))
        .filter((msg) => msg !== "")
        .join(separator)
    }

    /**
     * Extracts all debug messages from the fault chain.
     */
    static getDebug(fault: FaultLike, options?: Partial<ChainFormattingOptions>): string {
      const {
        separator = " ",
        formatter = (msg: string) => {
          const trimmed = msg.trim()
          return HAS_PUNCTUATION.test(trimmed) ? trimmed : `${trimmed}.`
        },
      } = options ?? {}

      return fault
        .unwrap()
        .filter((e): e is FaultBase => FaultBase.isFault(e))
        .map((err) => formatter(err.debug ?? ""))
        .filter((msg) => msg.trim() !== "" && msg !== ".")
        .join(separator)
    }
  }

  type Tagged<TBase, TTag extends Tag> = TBase &
    TagBrand<TTag> & {
      readonly tag: TTag
      // oxlint-disable-next-line typescript/no-empty-object-type
      readonly context: {} extends TRegistry[TTag] ? TRegistry[TTag] | undefined : TRegistry[TTag]
    }

  return FaultBase
}

/**
 * Base Fault class with a generic registry for use with extend() and standalone usage.
 * This class provides static methods like isFault, wrap, getDebug, getIssue, etc.
 */
export const BaseFault = define<Record<string, Record<string, unknown>>>()

/**
 * Type alias for BaseFault instance.
 */
export type BaseFault = InstanceType<typeof BaseFault>

// Default export for the Faultier namespace
const Faultier = {
  IS_FAULT,
  UNKNOWN,
  define,
  /**
   * Checks if a value is a Fault instance.
   */
  isFault: (value: unknown) => BaseFault.isFault(value),
  /**
   * Wraps an unknown error into a Fault instance.
   */
  wrap: (error: unknown) => BaseFault.wrap(error),
}
export default Faultier
