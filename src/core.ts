import BaseFault, { IS_FAULT } from "./base"
import type { ContextForTag, FaultTag } from "./types"

const FAULT_TAG = "FAULT" as const

/**
 * A Fault is an enhanced error object that supports tagging, debug messages,
 * context, and error chaining.
 *
 * Configure application-wide tags and context schemas using module augmentation:
 *
 * @example
 * ```ts
 * // Define your error registry (once per application)
 * declare module "faultier" {
 *   interface FaultRegistry {
 *     tags: {
 *       DATABASE_ERROR: true
 *       AUTH_ERROR: true
 *       NOT_FOUND: true
 *     }
 *     context: {
 *       DATABASE_ERROR: { query: string; host: string }
 *     }
 *   }
 * }
 *
 * // Use with full type-safety
 * try {
 *   await database.query()
 * } catch (err) {
 *   throw Fault.wrap(err)
 *     .withTag("DATABASE_ERROR")
 *     .withDescription("Failed to query database", "Database unavailable")
 *     .withContext({ query: "SELECT * FROM users", host: "localhost" })
 * }
 *
 * // Handle with switch
 * if (Fault.isFault(error)) {
 *   switch (error.tag) {
 *     case "DATABASE_ERROR":
 *       console.log(error.context.query) // Typed!
 *       break
 *   }
 * }
 * ```
 */
export default class Fault<
  TTag extends string = FaultTag,
  TContext extends ContextForTag<TTag> = ContextForTag<TTag>,
> extends BaseFault<TTag, TContext> {
  /** The tag categorizing this fault */
  tag: TTag
  /** Internal debug message (not shown to end users) */
  debug?: string
  /** Additional structured data associated with this fault */
  context: TContext = {} as TContext
  /** The underlying error that caused this fault */
  declare cause?: Error

  private constructor(cause?: Error) {
    super(cause)

    this.tag = FAULT_TAG as TTag
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
  static create<Tag extends FaultTag>(
    tag: Tag
  ): Omit<Fault<Tag, ContextForTag<Tag>>, "withTag"> {
    return new Fault<Tag, ContextForTag<Tag>>().withTag(tag)
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
    return new Fault<FaultTag, ContextForTag<FaultTag>>(cause)
  }

  /**
   * Extends an existing Error class with Fault functionality.
   *
   * @template TErrorClass - The Error class to extend
   * @param ErrorClass - The Error class constructor
   * @returns Extended class with Fault methods
   *
   * @example
   * ```ts
   * class HttpError extends Error {
   *   constructor(message: string, public statusCode: number) {
   *     super(message)
   *   }
   * }
   *
   * const HttpFault = Fault.extend(HttpError)
   *
   * const fault = HttpFault.create("Not found", 404)
   *   .withTag("HTTP_ERROR")
   *   .withContext({ path: "/api/users" })
   *
   * console.log(fault.statusCode) // 404
   * console.log(fault.tag) // "HTTP_ERROR"
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Generic type parameter for mixin
  static extend<TErrorClass extends new (...args: any[]) => Error>(
    ErrorClass: TErrorClass
  ) {
    // @ts-expect-error - Mixin class
    class ExtendedFault<
      TExtendedTag extends string = FaultTag,
      TExtendedContext extends
        ContextForTag<TExtendedTag> = ContextForTag<TExtendedTag>,
    > extends ErrorClass {
      tag: TExtendedTag
      debug?: string
      context: TExtendedContext = {} as TExtendedContext
      declare cause?: Error

      // biome-ignore lint/suspicious/noExplicitAny: Generic type parameter
      private constructor(...args: any[]) {
        super(...args)
        this.tag = FAULT_TAG as TExtendedTag
      }

      static create(...args: ConstructorParameters<TErrorClass>) {
        return new ExtendedFault(...args)
      }

      [IS_FAULT] = true
    }

    // Copy all BaseFault methods to ExtendedFault.prototype
    const baseMethods = Object.getOwnPropertyDescriptors(BaseFault.prototype)
    for (const [key, descriptor] of Object.entries(baseMethods)) {
      if (key !== "constructor") {
        Object.defineProperty(ExtendedFault.prototype, key, descriptor)
      }
    }

    return ExtendedFault as unknown as {
      new (
        ...constructorArgs: ConstructorParameters<TErrorClass>
      ): BaseFault & InstanceType<TErrorClass>
      create(
        ...createArgs: ConstructorParameters<TErrorClass>
      ): BaseFault & InstanceType<TErrorClass>
    } & TErrorClass
  }
}
