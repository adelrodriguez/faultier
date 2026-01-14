import type {
  ChainFormattingOptions,
  ContextForTag,
  FaultJSON,
  FaultTag,
  PartialContextForTag,
  SerializableError,
  SerializableFault,
} from "./types"
import { HAS_PUNCTUATION } from "./utils"

// Default formatter for flatten method
const defaultTrimFormatter = (msg: string) => msg.trim()

// Symbol to identify Fault instances
export const IS_FAULT: unique symbol = Symbol("IS_FAULT")
export const UNKNOWN: unique symbol = Symbol("UNKNOWN")

// Type helper for objects with IS_FAULT symbol
type WithIsFault = {
  readonly [IS_FAULT]: true
}

export abstract class BaseFault extends Error {
  abstract tag: FaultTag | "No fault tag set"
  abstract context: ContextForTag<FaultTag> | Record<string, unknown>

  declare name: string
  declare message: string
  declare cause?: Error

  debug?: string

  constructor(cause?: Error, debug?: string, message?: string) {
    super(message ?? cause?.message)
    this.name = "Fault"
    this.cause = cause
    this.debug = debug
    // Initialize the IS_FAULT symbol property
    Object.defineProperty(this, IS_FAULT, {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    })
  }

  /**
   * Sets debug and/or user-facing messages for this fault.
   *
   * @param debug - Internal debug message (for developers/logs)
   * @param message - Optional user-facing message (overrides the original error message)
   * @returns This fault instance for method chaining
   *
   * @example
   * ```ts
   * fault.withDescription(
   *   "Failed to connect to PostgreSQL on port 5432",
   *   "Database is temporarily unavailable"
   * )
   * ```
   */
  withDescription(debug: string, message?: string): this {
    this.debug = debug

    if (message !== undefined) {
      this.message = message
    }

    return this
  }

  /**
   * Sets only the debug message for this fault.
   *
   * @param debug - Internal debug message (for developers/logs)
   * @returns This fault instance for method chaining
   *
   * @example
   * ```ts
   * fault.withDebug("Failed to connect to PostgreSQL on port 5432")
   * ```
   */
  withDebug(debug: string): this {
    this.debug = debug
    return this
  }

  /**
   * Sets only the user-facing message for this fault.
   *
   * @param message - User-facing message (overrides the original error message)
   * @returns This fault instance for method chaining
   *
   * @example
   * ```ts
   * fault.withMessage("Database is temporarily unavailable")
   * ```
   */
  withMessage(message: string): this {
    this.message = message
    return this
  }

  /**
   * Gets the full error chain from this fault, including all causes.
   *
   * @returns Array starting with this fault, followed by all causes in order
   *
   * @example
   * ```ts
   * const chain = fault.unwrap()
   * // [fault3, fault2, fault1, originalError]
   * ```
   */
  unwrap(): [...TaggedFault<FaultTag>[], Error] {
    const chain: [...TaggedFault<FaultTag>[], Error] = [this]

    let current = this.cause

    // Only add to the chain if the cause is a Fault, except possibly the last
    // error.
    while (BaseFault.isFault(current)) {
      chain.push(current)
      current = current.cause
    }

    if (current) {
      chain.push(current)
    }

    return chain
  }

  /**
   * Flattens all messages from the fault chain into a single string.
   * Duplicate consecutive messages are automatically skipped.
   *
   * @param options - Formatting options (separator and formatter)
   * @returns Flattened string of all messages in the chain
   *
   * @example
   * ```ts
   * fault.flatten()
   * // "API failed -> Service unavailable -> Database timeout"
   *
   * fault.flatten({ separator: " | " })
   * // "API failed | Service unavailable | Database timeout"
   *
   * fault.flatten({ formatter: msg => msg.toUpperCase() })
   * // "API FAILED -> SERVICE UNAVAILABLE -> DATABASE TIMEOUT"
   * ```
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
   *
   * @returns Array of tags from current fault down to root cause
   *
   * @example
   * ```ts
   * fault.getTags()
   * // ["API_ERROR", "SERVICE_ERROR", "DB_ERROR"]
   * ```
   */
  getTags(): FaultTag[] {
    const chain = this.unwrap()
    return chain.filter((e) => BaseFault.isFault(e)).map((fault) => fault.tag as FaultTag)
  }

  /**
   * Gets the merged context from all faults in the error chain.
   * Contexts are merged from root cause to current fault, with later
   * faults overriding earlier ones for duplicate keys.
   *
   * @returns Merged context object from the entire chain
   *
   * @example
   * ```ts
   * fault.getFullContext()
   * // {
   * //   host: "localhost",
   * //   port: 5432,
   * //   query: "SELECT...",
   * //   userId: "123"
   * // }
   * ```
   */
  getFullContext(): Record<string, unknown> {
    const chain = this.unwrap()
    const faults = chain.filter((e) => BaseFault.isFault(e))
    const merged: Record<string, unknown> = {}

    for (const fault of faults.toReversed()) {
      Object.assign(merged, fault.context)
    }

    return merged
  }

  /** @internal */
  toJSON(): FaultJSON {
    return {
      cause: this.cause?.message,
      context: this.context,
      debug: BaseFault.getDebug(this, { separator: " → " }),
      message: BaseFault.getIssue(this, { separator: " → " }),
      name: this.name,
      tag: this.tag,
    }
  }

  /**
   * Checks if a value is a Fault with strict type checking.
   * @param value - The value to check
   * @returns True if the value is a Fault, false otherwise
   *
   * @example
   * ```ts
   * const fault = Fault.wrap(new Error("Something went wrong"))
   * if (Fault.isFault(fault)) {
   *   console.log(fault.tag)
   * }
   * ```
   */
  static isFault(value: unknown): value is {
    [K in FaultTag]: TaggedFault<K>
  }[FaultTag] {
    if (value instanceof BaseFault) {
      return true
    }

    if (typeof value !== "object" || value === null) {
      return false
    }

    return IS_FAULT in value && (value as WithIsFault)[IS_FAULT]
  }

  /**
   * Checks if a match result is UNKNOWN (not a fault or no handler matched).
   * Use this to check the result of matchTag, matchTags, or handle.
   *
   * @param value - The result from matchTag, matchTags, or handle
   * @returns True if the value is UNKNOWN
   *
   * @example
   * ```ts
   * const result = Fault.matchTags(error, {
   *   NOT_FOUND: (fault) => ({ status: 404 }),
   * });
   *
   * if (Fault.isUnknown(result)) {
   *   // Not a fault or unhandled tag
   * }
   * ```
   */
  static isUnknown(value: unknown): value is typeof UNKNOWN {
    return value === UNKNOWN
  }

  /**
   * Serializes a fault and its entire error chain into a plain object.
   * Unlike toJSON(), this preserves the full cause chain as nested objects.
   *
   * @param fault - The fault to serialize
   * @returns Serialized fault with nested cause chain
   *
   * @example
   * ```ts
   * const serialized = BaseFault.toSerializable(fault)
   * // {
   * //   name: "Fault",
   * //   tag: "API_ERROR",
   * //   message: "API request failed",
   * //   context: { endpoint: "/users" },
   * //   cause: {
   * //     name: "Fault",
   * //     tag: "NETWORK_ERROR",
   * //     message: "Connection timeout",
   * //     context: { host: "api.example.com" }
   * //   }
   * // }
   * ```
   */
  static toSerializable(fault: BaseFault): SerializableFault {
    const serialized: SerializableFault = {
      context: fault.context as Record<string, unknown>,
      debug: fault.debug,
      message: fault.message,
      name: fault.name,
      tag: fault.tag,
    }

    if (fault.cause) {
      if (BaseFault.isFault(fault.cause)) {
        serialized.cause = Fault.toSerializable(fault.cause)
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
   *
   * @param data - Serialized fault data
   * @returns Reconstructed Fault instance with full chain
   *
   * @example
   * ```ts
   * const serialized = BaseFault.toSerializable(originalFault)
   * const restored = Fault.fromSerializable(serialized)
   *
   * console.log(restored.tag) // Same as original
   * console.log(restored.unwrap().length) // Same chain length
   * ```
   */
  static fromSerializable<T extends FaultTag = FaultTag>(
    data: SerializableFault | SerializableError
  ): TaggedFault<T> {
    // Helper to reconstruct cause chain recursively
    const reconstructCause = (
      causeData: SerializableFault | SerializableError | undefined
    ): Error | undefined => {
      if (!causeData) {
        return
      }

      // Check if it's a SerializableFault or SerializableError
      if ("tag" in causeData) {
        // It's a SerializableFault - recursively reconstruct
        return Fault.fromSerializable(causeData)
      }

      // It's a SerializableError - create plain Error
      const error = new Error(causeData.message)
      error.name = causeData.name
      return error
    }

    // Data must be a SerializableFault (not SerializableError) for top level
    if (!("tag" in data)) {
      throw new Error("Cannot deserialize SerializableError as Fault. Top-level must be a Fault.")
    }

    const cause = reconstructCause(data.cause)

    // Create TaggedFault instance with the deserialized data
    const fault = new TaggedFault(null, data.tag as T, data.context as ContextForTag<T>)
    fault.name = data.name
    fault.message = data.message
    fault.cause = cause
    fault.debug = data.debug

    return fault
  }

  /**
   * Extracts all user-facing messages from the fault chain.
   *
   * @param fault - The fault to extract messages from
   * @param options - Formatting options (separator and formatter)
   * @returns Formatted messages joined by separator
   *
   * @example
   * ```ts
   * BaseFault.getIssue(fault)
   * // "Service unavailable. Database connection failed."
   *
   * BaseFault.getIssue(fault, { separator: " | " })
   * // "Service unavailable. | Database connection failed."
   *
   * BaseFault.getIssue(fault, { formatter: msg => msg.toUpperCase() })
   * // "SERVICE UNAVAILABLE DATABASE CONNECTION FAILED"
   * ```
   */
  static getIssue(fault: BaseFault, options?: Partial<ChainFormattingOptions>): string {
    const {
      separator = " ",
      formatter = (msg: string) => {
        const trimmed = msg.trim()
        return HAS_PUNCTUATION.test(trimmed) ? trimmed : `${trimmed}.`
      },
    } = options ?? {}

    return fault
      .unwrap()
      .filter((e) => BaseFault.isFault(e))
      .map((err) => formatter(err.message))
      .join(separator)
  }

  /**
   * Extracts all debug messages from the fault chain.
   *
   * @param fault - The fault to extract debug messages from
   * @param options - Formatting options (separator and formatter)
   * @returns Formatted debug messages joined by separator
   *
   * @example
   * ```ts
   * BaseFault.getDebug(fault)
   * // "Service failed after 3 retries. DB timeout on port 5432."
   *
   * BaseFault.getDebug(fault, { separator: " -> " })
   * // "Service failed after 3 retries. -> DB timeout on port 5432."
   * ```
   */
  static getDebug(fault: BaseFault, options?: Partial<ChainFormattingOptions>): string {
    const {
      separator = " ",
      formatter = (msg: string) => {
        const trimmed = msg.trim()
        return HAS_PUNCTUATION.test(trimmed) ? trimmed : `${trimmed}.`
      },
    } = options ?? {}

    return fault
      .unwrap()
      .filter((e) => BaseFault.isFault(e))
      .map((err) => formatter(err.debug ?? ""))
      .filter((msg) => msg.trim() !== "" && msg !== ".")
      .join(separator)
  }

  /**
   * Asserts that the given error is a Fault instance.
   * If the error is not a Fault, it is re-thrown.
   *
   * @param error - The error to check
   * @throws The original error if it is not a Fault instance
   *
   * @example
   * ```ts
   * try {
   *   doSomething()
   * } catch (error) {
   *   Fault.assert(error)
   *   // error is now typed as BaseFault
   *   console.log(error.tag)
   * }
   * ```
   */
  static assert(error: unknown): asserts error is BaseFault {
    if (!BaseFault.isFault(error)) {
      throw error
    }
  }

  /**
   * Exhaustively dispatches a fault to handlers for all registered tags.
   * Use this in global error handlers where you need to handle every possible fault type.
   * For partial matching, use `matchTag` or `matchTags` instead.
   *
   * @param error - The value that may be a fault (or any error-like value)
   * @param handlers - Handlers for ALL tags in FaultRegistry
   * @returns The result of the handler if a matching handler exists for the fault's tag, or UNKNOWN if error is not a fault or there is no handler for its tag
   */
  static handle<
    H extends {
      // oxlint-disable-next-line typescript/no-explicit-any
      [T in FaultTag]: (fault: TaggedFault<T>) => any
    },
  >(
    error: unknown,
    handlers: H
  ): // Extract the return type of the handlers
    | {
        [K in FaultTag]: ReturnType<H[K]>
      }[FaultTag]
    | typeof UNKNOWN {
    if (!BaseFault.isFault(error)) {
      return UNKNOWN
    }

    const handler = handlers[error.tag]

    if (handler) {
      // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-return, typescript/no-unsafe-argument
      return handler(error as any)
    }

    return UNKNOWN
  }

  /**
   * Matches a fault against a single tag.
   * Runs the callback only if the error is a fault with the specified tag.
   *
   * @param error - The value that may be a fault
   * @param tag - The tag to match against
   * @param callback - Handler to run if the tag matches
   * @returns The callback result, or UNKNOWN if not matched
   *
   * @example
   * ```ts
   * const result = Fault.matchTag(error, "DATABASE_ERROR", (fault) => {
   *   logger.error("DB error", fault.context.query);
   *   return { status: 500 };
   * });
   *
   * if (Fault.isUnknown(result)) {
   *   // Not a fault or different tag
   * }
   * ```
   */
  static matchTag<TTag extends FaultTag, TResult>(
    error: unknown,
    tag: TTag,
    callback: (fault: TaggedFault<TTag>) => TResult
  ): TResult | typeof UNKNOWN {
    if (!BaseFault.isFault(error)) {
      return UNKNOWN
    }

    if (error.tag === tag) {
      return callback(error as TaggedFault<TTag>)
    }

    return UNKNOWN
  }

  /**
   * Matches a fault against multiple tags.
   * Runs the matching handler if the error is a fault with one of the specified tags.
   * Unlike `handle`, only requires handlers for the tags you want to match.
   *
   * @param error - The value that may be a fault
   * @param handlers - Handlers for the tags you want to match
   * @returns The handler result, or UNKNOWN if not matched
   *
   * @example
   * ```ts
   * const result = Fault.matchTags(error, {
   *   NOT_FOUND: (fault) => ({ status: 404 }),
   *   DB_ERROR: (fault) => ({ status: 500 }),
   * });
   *
   * if (Fault.isUnknown(result)) {
   *   // Not a fault or unhandled tag
   * }
   * ```
   */
  static matchTags<
    THandlers extends {
      [K in keyof THandlers]: K extends FaultTag ? (fault: TaggedFault<K>) => unknown : never
    },
  >(
    error: unknown,
    handlers: THandlers
  ):
    | {
        [K in keyof THandlers]: ReturnType<THandlers[K]>
      }[keyof THandlers]
    | typeof UNKNOWN {
    if (!BaseFault.isFault(error)) {
      return UNKNOWN
    }

    const handler = handlers[error.tag as keyof THandlers]

    if (handler) {
      // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-return, typescript/no-unsafe-call
      return (handler as any)(error as any)
    }

    return UNKNOWN
  }
}

export default class Fault extends BaseFault {
  tag = "No fault tag set" as const
  context: Record<string, unknown> = {}

  private constructor(cause?: Error) {
    super(cause)
  }

  withTag<T extends FaultTag>(tag: T): TaggedFault<T> {
    return new TaggedFault(this, tag)
  }

  /**
   * Wraps an unknown error into a Fault instance.
   * Uses types from the global FaultRegistry (FaultRegistry.tags and FaultRegistry.context) by default.
   *
   * @param error - The error to wrap (Error object or any value)
   * @returns A new Fault instance wrapping the error
   *
   * @example
   * ```ts
   * // Basic usage with FaultRegistry types
   * try {
   *   await database.query()
   * } catch (err) {
   *   throw Fault.wrap(err)
   *     .withTag("DATABASE_ERROR")
   *     .withDescription("Query failed")
   *     .withContext({ query: "SELECT *" }) // Type-safe based on tag!
   * }
   * ```
   */
  static wrap(error: unknown): Fault {
    const cause = error instanceof Error ? error : new Error(String(error))
    return new Fault(cause)
  }

  /**
   * Creates a Fault with the specified tag.
   *
   * @param tag - The fault tag
   * @returns Fault instance (without withTag method)
   *
   * @example
   * ```ts
   * Fault.create("DATABASE_ERROR")
   *   .withDescription("Connection failed")
   *   .withContext({ query: "SELECT *" })
   * ```
   */
  static create<T extends FaultTag>(tag: T): TaggedFault<T> {
    return new TaggedFault(null, tag)
  }
}

class TaggedFault<T extends FaultTag> extends BaseFault {
  tag: T
  context: PartialContextForTag<T>

  constructor(fault: Fault | TaggedFault<T> | null, tag: T, context?: ContextForTag<T>) {
    super(fault?.cause, fault?.debug, fault?.message)
    this.tag = tag
    this.context = (context ?? {}) as PartialContextForTag<T>
  }

  withContext(context: ContextForTag<T>): ContextForTag<T> extends never ? never : TaggedFault<T> {
    // Type assertion needed because TypeScript can't narrow the conditional return type
    // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-return
    return new TaggedFault(this, this.tag, context) as any
  }

  clearContext(): TaggedFault<T> {
    return new TaggedFault(this, this.tag)
  }
}
