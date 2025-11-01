import type { ContextForTag, FaultJSON, FaultTag } from "./types"

export const IS_FAULT: symbol = Symbol("isFault")

export default abstract class BaseFault<
  TTag extends string = string,
  TContext extends ContextForTag<TTag> = ContextForTag<TTag>,
> extends Error {
  declare name: string
  declare message: string
  declare cause?: Error

  abstract tag: TTag
  abstract context: TContext
  abstract debug?: string

  constructor(cause?: Error) {
    super(cause?.message)
    this.name = "Fault"
    this.cause = cause
  }

  /**
   * Sets the tag for this fault.
   * Tags are used to categorize and identify fault types.
   * The context type is automatically inferred based on the tag.
   *
   * @param tag - The tag to set
   * @returns This fault instance for method chaining, with context type inferred from tag
   *
   * @example
   * ```ts
   * fault.withTag("DATABASE_ERROR")
   *   .withContext({ query: "SELECT *", host: "localhost" }) // Type-safe!
   * ```
   */
  withTag<SelectedTag extends TTag>(tag: SelectedTag): this {
    this.tag = tag
    return this
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
   * Adds or merges context to the fault.
   * Context objects are shallow merged with existing context.
   *
   * @param context - The context to merge
   * @returns This fault instance for method chaining
   *
   * @example
   * ```ts
   * fault
   *   .withContext({ userId: "123", requestId: "abc" })
   *   .withContext({ sessionId: "xyz" })
   * // Context is now: { userId: "123", requestId: "abc", sessionId: "xyz" }
   * ```
   */
  withContext(
    context: TContext extends object ? Partial<TContext> : TContext
  ): this {
    if (typeof context === "object" && typeof this.context === "object") {
      this.context = { ...this.context, ...context } as TContext
    } else {
      this.context = context as TContext
    }
    return this
  }

  /**
   * Clears all context data, resetting it to an empty object.
   *
   * @returns This fault instance for method chaining
   *
   * @example
   * ```ts
   * fault.withContext({ key: "value" }).clearContext()
   * // Context is now: {}
   * ```
   */
  clearContext(): this {
    this.context = {} as TContext
    return this
  }

  /**
   * @internal
   * Serializes a single fault for JSON.stringify(). Not intended for direct use.
   */
  toJSON(): FaultJSON<TTag, TContext> {
    return {
      name: this.name,
      tag: this.tag,
      message: this.message,
      debug: this.debug,
      context: this.context,
      cause: this.cause?.message,
    }
  }
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
  unwrap(): [...BaseFault<TTag, TContext>[], Error] {
    const chain: [...BaseFault<TTag, TContext>[], Error] = [this]

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
   * @param separator - String to join messages with (default: "->")
   * @returns Flattened string of all messages in the chain
   *
   * @example
   * ```ts
   * fault.flatten()
   * // "API failed -> Service unavailable -> Database timeout"
   *
   * fault.flatten("|")
   * // "API failed | Service unavailable | Database timeout"
   * ```
   */
  flatten(separator = "->"): string {
    const chain = this.unwrap()
    const messages: string[] = []
    let lastMessage: string | undefined

    for (const err of chain) {
      if (err.message !== lastMessage) {
        messages.push(err.message)
        lastMessage = err.message
      }
    }

    return messages.join(` ${separator} `)
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
   * Type guard to check if a value is a Fault instance.
   * Automatically narrows to FaultRegistry types (from FaultRegistry.tags and FaultRegistry.context).
   *
   * @param value - Value to check
   * @returns True if value is a Fault
   *
   * @example
   * ```ts
   * if (Fault.isFault(err)) {
   *   console.log(err.tag) // TypeScript knows err is a Fault
   *   switch (err.tag) {
   *     case "DATABASE_ERROR":
   *       console.log(err.context.query) // Typed from FaultRegistry.context!
   *       break
   *   }
   * }
   * ```
   */
  static isFault(value: unknown): value is BaseFault {
    if (value instanceof BaseFault) {
      return true
    }

    if (typeof value !== "object" || value === null) {
      return false
    }

    return IS_FAULT in value
  }
}
