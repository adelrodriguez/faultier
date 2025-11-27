// biome-ignore-all lint/suspicious/noExplicitAny: Used for generic constructors
// biome-ignore-all lint/nursery/noShadow: Allow shadowing of args variable

import { BaseFault, IS_FAULT } from "./index"
import type { ContextForTag, FaultTag } from "./types"

// Helper type to ensure extended faults have BaseFault methods
type WithBaseFaultMethods = Pick<
  BaseFault,
  | "unwrap"
  | "flatten"
  | "getTags"
  | "getFullContext"
  | "toJSON"
  | "withDescription"
  | "withDebug"
  | "withMessage"
  | typeof IS_FAULT
>

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
) {
  // Use a type alias to avoid TypeScript compiler crash with nested generic class extends
  type ErrorClassType = TErrorClass

  // Interface for fault with tag
  interface ExtendedFaultWithTag<T extends FaultTag> {
    tag: T
    context: Record<string, unknown>
    debug?: string
    cause?: Error
    message: string
    name: string
    withContext<C extends ContextForTag<T>>(
      context: C
    ): ExtendedFaultWithContext<T, C> &
      InstanceType<TErrorClass> &
      WithBaseFaultMethods
    withDescription(debug: string, message?: string): this
    withDebug(debug: string): this
    withMessage(message: string): this
  }

  // Interface for fault with context
  interface ExtendedFaultWithContext<
    T extends FaultTag,
    C extends ContextForTag<T>,
  > {
    tag: T
    context: C
    debug?: string
    cause?: Error
    message: string
    name: string
    clearContext(): ExtendedFaultWithTag<T> &
      InstanceType<TErrorClass> &
      WithBaseFaultMethods
    withDescription(debug: string, message?: string): this
    withDebug(debug: string): this
    withMessage(message: string): this
  }

  // Create base extended fault class
  const ExtendedFaultBase = class extends (ErrorClass as new (
    ...args: any[]
  ) => Error) {
    tag: FaultTag | "No fault tag set" = "No fault tag set"
    context: Record<string, unknown> = {}
    debug?: string
    declare cause?: Error;
    [IS_FAULT] = true as const

    withTag<T extends FaultTag>(
      tag: T
    ): ExtendedFaultWithTag<T> &
      InstanceType<TErrorClass> &
      WithBaseFaultMethods {
      return new ExtendedFaultWithTagClass(
        this,
        tag
      ) as unknown as ExtendedFaultWithTag<T> &
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
    ): ExtendedFault & InstanceType<TErrorClass> & WithBaseFaultMethods {
      return new ExtendedFaultBase(...args) as ExtendedFault &
        InstanceType<TErrorClass> &
        WithBaseFaultMethods
    }
  }

  // Type for the extended fault
  type ExtendedFault = InstanceType<typeof ExtendedFaultBase>

  // Create fault with tag class - extends the base class cast to Error
  const ExtendedFaultWithTagClass = class extends ExtendedFaultBase {
    override tag: FaultTag | "No fault tag set" = "No fault tag set"
    override context: Record<string, unknown> = {}

    constructor(fault: ExtendedFault, tag: FaultTag) {
      // Get constructor args from fault to call parent constructor
      const args = new Array(ErrorClass.length).fill(undefined)
      super(...args)

      this.tag = tag
      this.message = fault.message
      this.name = fault.name
      this.cause = fault.cause
      this.debug = fault.debug

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
    ): ExtendedFaultWithContext<FaultTag, C> &
      InstanceType<TErrorClass> &
      WithBaseFaultMethods {
      return new ExtendedFaultWithContextClass(
        this,
        this.tag as FaultTag,
        context
      ) as unknown as ExtendedFaultWithContext<FaultTag, C> &
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
      super(fault as unknown as ExtendedFault, tag)

      this.context = context
      this.message = fault.message
      this.name = fault.name
      this.cause = fault.cause
      this.debug = fault.debug

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

    clearContext(): ExtendedFaultWithTag<FaultTag> &
      InstanceType<TErrorClass> &
      WithBaseFaultMethods {
      const fault = Object.create(ExtendedFaultWithTagClass.prototype)
      Object.assign(fault, this)
      fault.context = {}
      return fault as ExtendedFaultWithTag<FaultTag> &
        InstanceType<TErrorClass> &
        WithBaseFaultMethods
    }
  }

  // Copy all BaseFault prototype methods to ExtendedFaultBase
  // ExtendedFaultWithTagClass and ExtendedFaultWithContextClass will inherit them
  const descriptors = Object.getOwnPropertyDescriptors(BaseFault.prototype)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key !== "constructor" && !(key in ExtendedFaultBase.prototype)) {
      Object.defineProperty(ExtendedFaultBase.prototype, key, descriptor)
    }
  }

  return ExtendedFaultBase as unknown as {
    new (
      ...args: ConstructorParameters<TErrorClass>
    ): ExtendedFault & InstanceType<TErrorClass> & WithBaseFaultMethods
    create(
      ...args: ConstructorParameters<TErrorClass>
    ): ExtendedFault & InstanceType<TErrorClass> & WithBaseFaultMethods
  }
}
