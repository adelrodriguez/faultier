// biome-ignore-all lint/suspicious/noExplicitAny: Used for generic constructors
// biome-ignore-all lint/nursery/noShadow: Allow shadowing of args variable

import { BaseFault, IS_FAULT } from "./index"
import type { ContextForTag, FaultTag } from "./types"

// Helper type to ensure extended faults have BaseFault methods
export type WithBaseFaultMethods = Pick<
  BaseFault,
  | "unwrap"
  | "flatten"
  | "getTags"
  | "getFullContext"
  | "toJSON"
  | "withDescription"
  | "withDebug"
  | "withMessage"
>

/**
 * Interface for an extended fault with a tag set.
 * This represents the state after calling `.withTag()` on an extended fault.
 */
export interface ExtendedFaultWithTag<
  TErrorClass extends new (
    ...args: any[]
  ) => Error,
  T extends FaultTag,
> {
  tag: T
  context: Record<string, unknown>
  debug?: string
  cause?: Error
  message: string
  name: string
  withContext<C extends ContextForTag<T>>(
    context: C
  ): ContextForTag<T> extends never
    ? never
    : ExtendedFaultWithContext<TErrorClass, T, C> &
        InstanceType<TErrorClass> &
        WithBaseFaultMethods
  withDescription(debug: string, message?: string): this
  withDebug(debug: string): this
  withMessage(message: string): this
}

/**
 * Interface for an extended fault with both tag and context set.
 * This represents the state after calling `.withContext()` on a tagged extended fault.
 */
export interface ExtendedFaultWithContext<
  TErrorClass extends new (
    ...args: any[]
  ) => Error,
  T extends FaultTag,
  C extends ContextForTag<T>,
> {
  tag: T
  context: C
  debug?: string
  cause?: Error
  message: string
  name: string
  clearContext(): ExtendedFaultWithTag<TErrorClass, T> &
    InstanceType<TErrorClass> &
    WithBaseFaultMethods
  withDescription(debug: string, message?: string): this
  withDebug(debug: string): this
  withMessage(message: string): this
}

/**
 * Interface for a base extended fault (before `.withTag()` is called).
 */
export interface ExtendedFaultBase<
  TErrorClass extends new (
    ...args: any[]
  ) => Error,
> {
  tag: FaultTag | "No fault tag set"
  context: Record<string, unknown>
  debug?: string
  cause?: Error
  message: string
  name: string
  withTag<T extends FaultTag>(
    tag: T
  ): ExtendedFaultWithTag<TErrorClass, T> &
    InstanceType<TErrorClass> &
    WithBaseFaultMethods
  withDescription(debug: string, message?: string): this
  withDebug(debug: string): this
  withMessage(message: string): this
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
 * const HttpFault = extend(HttpError)
 *
 * const fault = HttpFault.create("Not found", 404)
 *   .withTag("HTTP_ERROR")
 *   .withContext({ path: "/api/users" })
 *
 * console.log(fault.statusCode) // 404
 * console.log(fault.tag) // "HTTP_ERROR"
 * ```
 */
export function extend<TErrorClass extends new (...args: any[]) => Error>(
  ErrorClass: TErrorClass
): {
  new (
    ...args: ConstructorParameters<TErrorClass>
  ): ExtendedFaultBase<TErrorClass> &
    InstanceType<TErrorClass> &
    WithBaseFaultMethods
  create(
    ...args: ConstructorParameters<TErrorClass>
  ): ExtendedFaultBase<TErrorClass> &
    InstanceType<TErrorClass> &
    WithBaseFaultMethods
} {
  // Use a type alias to avoid TypeScript compiler crash with nested generic class extends
  type ErrorClassType = TErrorClass

  // Create base extended fault class
  const ExtendedFaultBaseClass = class extends (ErrorClass as new (
    ...args: any[]
  ) => Error) {
    tag: FaultTag | "No fault tag set" = "No fault tag set"
    context: Record<string, unknown> = {}
    debug?: string
    declare cause?: Error

    constructor(...args: ConstructorParameters<ErrorClassType>) {
      super(...args)
      // Initialize the IS_FAULT symbol property
      Object.defineProperty(this, IS_FAULT, {
        value: true,
        writable: false,
        enumerable: false,
        configurable: false,
      })
    }

    withTag<T extends FaultTag>(
      tag: T
    ): ExtendedFaultWithTag<TErrorClass, T> &
      InstanceType<TErrorClass> &
      WithBaseFaultMethods {
      return new ExtendedFaultWithTagClass(
        this,
        tag
      ) as unknown as ExtendedFaultWithTag<TErrorClass, T> &
        InstanceType<TErrorClass> &
        WithBaseFaultMethods
    }

    withDescription(debug: string, message?: string): this {
      this.debug = debug
      this.message = message ?? this.message
      return this
    }

    withDebug(debug: string): this {
      this.debug = debug
      return this
    }

    withMessage(message: string): this {
      this.message = message
      return this
    }

    static create(
      ...args: ConstructorParameters<ErrorClassType>
    ): ExtendedFaultBase<TErrorClass> &
      InstanceType<TErrorClass> &
      WithBaseFaultMethods {
      return new ExtendedFaultBaseClass(
        ...args
      ) as ExtendedFaultBase<TErrorClass> &
        InstanceType<TErrorClass> &
        WithBaseFaultMethods
    }
  }

  // Type for the extended fault instance
  type ExtendedFaultInstance = InstanceType<typeof ExtendedFaultBaseClass>

  // Create fault with tag class - extends the base class cast to Error
  const ExtendedFaultWithTagClass = class extends ExtendedFaultBaseClass {
    override tag: FaultTag | "No fault tag set" = "No fault tag set"
    override context: Record<string, unknown> = {}

    constructor(fault: ExtendedFaultInstance, tag: FaultTag) {
      // Get constructor args from fault to call parent constructor
      const args = new Array(ErrorClass.length).fill(
        undefined
      ) as ConstructorParameters<ErrorClassType>
      super(...args)

      this.tag = tag
      this.message = fault.message
      this.name = fault.name
      this.cause = fault.cause
      this.debug = fault.debug

      // Preserve original stack trace
      if (fault.stack) {
        this.stack = fault.stack
      }

      // Copy all original error properties (skip symbol properties)
      for (const key of Object.keys(fault)) {
        if (
          key !== "tag" &&
          key !== "context" &&
          key !== "cause" &&
          key !== "debug" &&
          key !== "message" &&
          key !== "name" &&
          key !== "stack"
        ) {
          ;(this as any)[key] = (fault as any)[key]
        }
      }
    }

    withContext<C extends ContextForTag<FaultTag>>(
      context: C
    ): ContextForTag<FaultTag> extends never
      ? never
      : ExtendedFaultWithContext<TErrorClass, FaultTag, C> &
          InstanceType<TErrorClass> &
          WithBaseFaultMethods {
      // Type assertion needed because TypeScript can't narrow the conditional return type
      return new ExtendedFaultWithContextClass(
        this,
        this.tag as FaultTag,
        context
      ) as unknown as ExtendedFaultWithContext<TErrorClass, FaultTag, C> &
        InstanceType<TErrorClass> &
        WithBaseFaultMethods
    }
  }

  // Create fault with context class
  const ExtendedFaultWithContextClass = class extends ExtendedFaultWithTagClass {
    override context: ContextForTag<FaultTag> = {} as ContextForTag<FaultTag>

    constructor(
      fault: InstanceType<typeof ExtendedFaultWithTagClass>,
      tag: FaultTag,
      context: ContextForTag<FaultTag>
    ) {
      super(fault as unknown as ExtendedFaultInstance, tag)

      this.context = context
      this.message = fault.message
      this.name = fault.name
      this.cause = fault.cause
      this.debug = fault.debug

      // Preserve original stack trace
      if (fault.stack) {
        this.stack = fault.stack
      }

      // Copy all original error properties (skip symbol properties)
      for (const key of Object.keys(fault)) {
        if (
          key !== "tag" &&
          key !== "context" &&
          key !== "cause" &&
          key !== "debug" &&
          key !== "message" &&
          key !== "name" &&
          key !== "stack"
        ) {
          ;(this as any)[key] = (fault as any)[key]
        }
      }
    }

    clearContext(): ExtendedFaultWithTag<TErrorClass, FaultTag> &
      InstanceType<TErrorClass> &
      WithBaseFaultMethods {
      const fault = Object.create(ExtendedFaultWithTagClass.prototype)
      Object.assign(fault, this)
      fault.context = {}
      // Preserve IS_FAULT symbol (Object.assign doesn't copy non-enumerable properties)
      Object.defineProperty(fault, IS_FAULT, {
        value: true,
        writable: false,
        enumerable: false,
        configurable: false,
      })
      return fault as ExtendedFaultWithTag<TErrorClass, FaultTag> &
        InstanceType<TErrorClass> &
        WithBaseFaultMethods
    }
  }

  // Copy all BaseFault prototype methods to ExtendedFaultBaseClass
  // ExtendedFaultWithTagClass and ExtendedFaultWithContextClass will inherit them
  const descriptors = Object.getOwnPropertyDescriptors(BaseFault.prototype)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key !== "constructor" && !(key in ExtendedFaultBaseClass.prototype)) {
      Object.defineProperty(ExtendedFaultBaseClass.prototype, key, descriptor)
    }
  }

  return ExtendedFaultBaseClass as unknown as {
    new (
      ...args: ConstructorParameters<TErrorClass>
    ): ExtendedFaultBase<TErrorClass> &
      InstanceType<TErrorClass> &
      WithBaseFaultMethods
    create(
      ...args: ConstructorParameters<TErrorClass>
    ): ExtendedFaultBase<TErrorClass> &
      InstanceType<TErrorClass> &
      WithBaseFaultMethods
  }
}
