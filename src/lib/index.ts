import type {
  ChainFormattingOptions,
  ContextMap,
  FaultJSON,
  SerializableError,
  SerializableFault,
  TaggedBase,
  Untagged,
} from "#lib/types.ts"
import {
  defaultDetailFormatter,
  defaultIssueFormatter,
  defaultTrimFormatter,
  formatFaultName,
  IS_FAULT,
  NO_TAG,
  UNKNOWN,
} from "#lib/utils.ts"

export { IS_FAULT, NO_TAG, UNKNOWN }

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
 * // Now fully typed:
 * Fault.create("auth.unauthenticated", { requestId: "123" })
 * ```
 */
export function define<TRegistry extends Record<string, Record<string, unknown> | undefined>>() {
  type Tag = keyof TRegistry & string

  type Tagged<TBase, TTag extends Tag> = TaggedBase<TBase, TTag, ContextMap<TRegistry>[TTag]>

  type RequiredTags = {
    [K in Tag]-?: TRegistry[K] extends never ? never : undefined extends TRegistry[K] ? never : K
  }[Tag]

  type OptionalTags = {
    [K in Tag]-?: undefined extends TRegistry[K] ? K : never
  }[Tag]

  type NoContextTags = {
    [K in Tag]-?: TRegistry[K] extends never ? K : never
  }[Tag]

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

    private __tag: Tag | typeof NO_TAG = NO_TAG
    private _context: Record<string, unknown> | undefined = undefined
    private _detail: string | undefined = undefined

    private get _tag(): Tag | typeof NO_TAG {
      return this.__tag
    }

    private set _tag(value: Tag | typeof NO_TAG) {
      this.__tag = value
      this.name = formatFaultName(this.constructor.name, value)
    }

    // Public getters - properly typed, single cast location
    get tag(): Tag | typeof NO_TAG {
      return this.__tag
    }

    get context(): Record<string, unknown> | undefined {
      return this._context
    }

    get detail(): string | undefined {
      return this._detail
    }

    declare cause?: Error

    constructor(message?: string, options?: ErrorOptions) {
      super(message, options)
      this._tag = NO_TAG
      Object.defineProperty(this, IS_FAULT, {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false,
      })
    }

    /**
     * Sets the tag for this fault and optional context.
     */
    withTag<TTag extends RequiredTags>(
      this: Untagged<this>,
      tag: TTag,
      context: TRegistry[TTag]
    ): Tagged<this, TTag>
    withTag<TTag extends OptionalTags>(
      this: Untagged<this>,
      tag: TTag,
      context?: Exclude<TRegistry[TTag], undefined>
    ): Tagged<this, TTag>
    withTag<TTag extends NoContextTags>(this: Untagged<this>, tag: TTag): Tagged<this, TTag>
    withTag(this: Untagged<this>, tag: Tag, context?: Record<string, unknown>): Tagged<this, Tag> {
      if (this._tag !== NO_TAG) {
        throw new Error("Cannot retag a fault; tag already set.")
      }
      this._tag = tag
      this._context = context
      return this as unknown as Tagged<this, Tag>
    }

    /**
     * Sets only the detail message for this fault.
     */
    withDetail(detail: string): this {
      this._detail = detail
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
          current = (current as this).cause
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
      return chain.filter((e): e is FaultBase => FaultBase.isFault(e)).map((fault) => fault.tag)
    }

    /**
     * Gets the merged context from all faults in the error chain.
     * Contexts are merged from root cause to current fault, with later
     * faults overriding earlier ones for duplicate keys.
     */
    getFullContext(): Record<string, unknown> {
      const chain = this.unwrap()
      const faults = chain.filter((e): e is FaultBase => FaultBase.isFault(e))
      const merged: Record<string, unknown> = {}

      for (const fault of faults.toReversed()) {
        Object.assign(merged, fault.context ?? {})
      }

      return merged
    }

    /**
     * Converts this fault to a JSON-serializable object.
     */
    toJSON(): FaultJSON {
      const context = this.context
      return {
        cause: this.cause?.message,
        ...(context === undefined ? {} : { context }),
        detail: FaultBase.getDetail(this, { separator: " → " }),
        message: FaultBase.getIssue(this, { separator: " → " }),
        name: this.name,
        tag: this.tag,
      }
    }

    // --- Static methods ---

    /**
     * Creates a new Fault with the specified tag.
     * Preserves the tag type through method chaining.
     * Uses polymorphic `this` so extended classes return their own type with custom methods.
     */
    static create<TTag extends RequiredTags, This extends typeof FaultBase>(
      this: This,
      tag: TTag,
      context: TRegistry[TTag]
    ): Tagged<InstanceType<This>, TTag>
    static create<TTag extends OptionalTags, This extends typeof FaultBase>(
      this: This,
      tag: TTag,
      context?: Exclude<TRegistry[TTag], undefined>
    ): Tagged<InstanceType<This>, TTag>
    static create<TTag extends NoContextTags, This extends typeof FaultBase>(
      this: This,
      tag: TTag
    ): Tagged<InstanceType<This>, TTag>
    static create<This extends typeof FaultBase>(
      this: This,
      tag: Tag,
      context?: Record<string, unknown>
    ): Tagged<InstanceType<This>, Tag> {
      const instance = new this()
      instance._tag = tag
      instance._context = context
      return instance as unknown as Tagged<InstanceType<This>, Tag>
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
      return IS_FAULT in value && value[IS_FAULT] === true
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
      const context = fault.context
      const serialized: SerializableFault = {
        _isFault: true,
        detail: fault.detail,
        message: fault.message,
        name: fault.name,
        tag: fault.tag,
        ...(context === undefined ? {} : { context }),
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

        if ("_isFault" in causeData && causeData._isFault) {
          return FaultBase.fromSerializable.call(this, causeData) as Error
        }

        const error = new Error(causeData.message)
        error.name = causeData.name
        return error
      }

      if (!("_isFault" in data && data._isFault)) {
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

      const cause = reconstructCause(data.cause)
      const instance = new this(data.message, { cause })
      instance._tag = data.tag as Tag
      instance._context = data.context
      instance._detail = data.detail

      return instance as InstanceType<This>
    }

    /**
     * Extracts all user-facing messages from the fault chain.
     */
    static getIssue(fault: FaultBase, options?: Partial<ChainFormattingOptions>): string {
      const { separator = " ", formatter = defaultIssueFormatter } = options ?? {}

      return fault
        .unwrap()
        .filter((e): e is FaultBase => FaultBase.isFault(e))
        .map((err) => formatter(err.message))
        .filter((msg) => msg !== "")
        .join(separator)
    }

    /**
     * Extracts all detail messages from the fault chain.
     */
    static getDetail(fault: FaultBase, options?: Partial<ChainFormattingOptions>): string {
      const { separator = " ", formatter = defaultDetailFormatter } = options ?? {}

      return fault
        .unwrap()
        .filter((e): e is FaultBase => FaultBase.isFault(e))
        .map((err) => formatter(err.detail ?? ""))
        .filter((msg) => msg.trim() !== "" && msg !== ".")
        .join(separator)
    }
  }

  return FaultBase
}

// Default export for the Faultier namespace
const Faultier = { IS_FAULT, NO_TAG, UNKNOWN, define }
export default Faultier
