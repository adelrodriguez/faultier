import type {
  ChainFormattingOptions,
  ContextForTag,
  FaultJSON,
  FaultTag,
  SerializableError,
  SerializableFault,
} from "./types"
import { HAS_PUNCTUATION } from "./utils"

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
      value: true,
      writable: false,
      enumerable: false,
      configurable: false,
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
  unwrap(): [...FaultWithContext<FaultTag, ContextForTag<FaultTag>>[], Error] {
    const chain: [
      ...FaultWithContext<FaultTag, ContextForTag<FaultTag>>[],
      Error,
    ] = [this]

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
    const defaultFormatter = (msg: string) => msg.trim()
    const { separator = " -> ", formatter = defaultFormatter } = options ?? {}

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
    return chain.filter(BaseFault.isFault).map((fault) => fault.tag as FaultTag)
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
    const faults = chain.filter(BaseFault.isFault)
    const merged: Record<string, unknown> = {}

    for (const fault of faults.reverse()) {
      Object.assign(merged, fault.context)
    }

    return merged
  }

  /**
   * @internal
   * Serializes a single fault for JSON.stringify(). Not intended for direct use.
   */
  toJSON(): FaultJSON {
    return {
      name: this.name,
      tag: this.tag,
      message: BaseFault.getIssue(this, { separator: " → " }),
      debug: BaseFault.getDebug(this, { separator: " → " }),
      context: this.context,
      cause: this.cause?.message,
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
    [K in FaultTag]: FaultWithContext<K, ContextForTag<K>>
  }[FaultTag] {
    if (value instanceof BaseFault) {
      return true
    }

    if (typeof value !== "object" || value === null) {
      return false
    }

    return IS_FAULT in value && (value as WithIsFault)[IS_FAULT] === true
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
      name: fault.name,
      tag: fault.tag,
      message: fault.message,
      context: fault.context as Record<string, unknown>,
      debug: fault.debug,
    }

    if (fault.cause) {
      if (BaseFault.isFault(fault.cause)) {
        serialized.cause = Fault.toSerializable(fault.cause)
      } else {
        serialized.cause = {
          name: fault.cause.name,
          message: fault.cause.message,
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
  ): FaultWithContext<T, ContextForTag<T>> {
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

    // data must be a SerializableFault (not SerializableError) for top level
    if (!("tag" in data)) {
      throw new Error(
        "Cannot deserialize SerializableError as Fault. Top-level must be a Fault."
      )
    }

    const cause = reconstructCause(data.cause)

    // Create instance bypassing private constructor
    // We use Object.create to set up the prototype chain, then manually
    // call Error's constructor to properly initialize the error internals.
    // This avoids Fault.create() which would set wrong initial state.
    const fault = Object.create(Fault.prototype) as FaultWithContext<
      T,
      ContextForTag<T>
    >
    Error.call(fault, cause?.message)

    // Set properties
    fault.name = data.name
    fault.tag = data.tag as T
    fault.message = data.message
    fault.context = data.context as ContextForTag<T>
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
  static getIssue(
    fault: BaseFault,
    options?: Partial<ChainFormattingOptions>
  ): string {
    const {
      separator = " ",
      formatter = (msg: string) => {
        const trimmed = msg.trim()
        return HAS_PUNCTUATION.test(trimmed) ? trimmed : `${trimmed}.`
      },
    } = options || {}

    return fault
      .unwrap()
      .filter(BaseFault.isFault)
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
  static getDebug(
    fault: BaseFault,
    options?: Partial<ChainFormattingOptions>
  ): string {
    const {
      separator = " ",
      formatter = (msg: string) => {
        const trimmed = msg.trim()
        return HAS_PUNCTUATION.test(trimmed) ? trimmed : `${trimmed}.`
      },
    } = options || {}

    return fault
      .unwrap()
      .filter(BaseFault.isFault)
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
   * Dispatches a fault to the handler corresponding to its tag.
   *
   * @param error - The value that may be a fault (or any error-like value)
   * @param handlers - An object mapping each fault tag to a handler function
   * @returns The result of the handler if a matching handler exists for the fault's tag, or UNKNOWN if error is not a fault or there is no handler for its tag
   */
  static handle<
    H extends {
      [T in FaultTag]: ContextForTag<T> extends never
        ? // biome-ignore lint/suspicious/noExplicitAny: generic handler return type
          (fault: FaultWithTag<T>) => any
        : // biome-ignore lint/suspicious/noExplicitAny: generic handler return type
          (fault: FaultWithContext<T, ContextForTag<T>>) => any
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
      // biome-ignore lint/suspicious/noExplicitAny: We know this is safe at runtime because handler matches error.tag
      return handler(error as any)
    }

    return UNKNOWN
  }
}

export default class Fault extends BaseFault {
  tag = "No fault tag set" as const
  context = {} as never

  private constructor(cause?: Error) {
    super(cause)
  }

  withTag<T extends FaultTag>(tag: T): FaultWithTag<T> {
    return new FaultWithTag(this, tag)
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
  static create<T extends FaultTag>(tag: T): FaultWithTag<T> {
    return new FaultWithTag(null, tag)
  }
}

class FaultWithTag<T extends FaultTag> extends BaseFault {
  tag: T
  context = {} as never

  constructor(fault: Fault | null, tag: T) {
    super(fault?.cause, fault?.debug, fault?.message)
    this.tag = tag
  }

  withContext<C extends ContextForTag<T>>(
    context: C
  ): ContextForTag<T> extends never ? never : FaultWithContext<T, C> {
    // Type assertion needed because TypeScript can't narrow the conditional return type
    // biome-ignore lint/suspicious/noExplicitAny: Conditional return type requires assertion
    return new FaultWithContext(this, this.tag, context) as any
  }
}

class FaultWithContext<
  T extends FaultTag,
  C extends ContextForTag<T>,
> extends BaseFault {
  tag: T
  context: C

  constructor(fault: FaultWithTag<T>, tag: T, context: C) {
    super(fault.cause, fault.debug, fault.message)
    this.tag = tag
    this.context = context
  }

  clearContext(): FaultWithTag<T> {
    this.context = {} as never
    return new FaultWithTag(this as unknown as Fault, this.tag)
  }
}
