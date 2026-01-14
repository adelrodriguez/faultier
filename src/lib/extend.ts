// oxlint-disable typescript/no-explicit-any

import type { ContextForTag, FaultTag, PartialContextForTag } from "./types"
import { BaseFault, IS_FAULT } from "./index"

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
 * Both `withContext()` and `clearContext()` are available on all tagged faults.
 */
export interface ExtendedTaggedFault<
  TErrorClass extends new (...args: any[]) => Error,
  T extends FaultTag,
> {
  tag: T
  context: PartialContextForTag<T>
  debug?: string
  cause?: Error
  message: string
  name: string
  withContext<C extends ContextForTag<T>>(
    context: C
  ): ContextForTag<T> extends never
    ? never
    : ExtendedTaggedFault<TErrorClass, T> & InstanceType<TErrorClass> & WithBaseFaultMethods
  clearContext(): ExtendedTaggedFault<TErrorClass, T> &
    InstanceType<TErrorClass> &
    WithBaseFaultMethods
  withDescription(debug: string, message?: string): this
  withDebug(debug: string): this
  withMessage(message: string): this
}

/**
 * Interface for a base extended fault (before `.withTag()` is called).
 */
export interface ExtendedFaultBase<TErrorClass extends new (...args: any[]) => Error> {
  tag: FaultTag | "No fault tag set"
  context: Record<string, unknown>
  debug?: string
  cause?: Error
  message: string
  name: string
  withTag<T extends FaultTag>(
    tag: T
  ): ExtendedTaggedFault<TErrorClass, T> & InstanceType<TErrorClass> & WithBaseFaultMethods
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
  ): ExtendedFaultBase<TErrorClass> & InstanceType<TErrorClass> & WithBaseFaultMethods
  create(
    ...args: ConstructorParameters<TErrorClass>
  ): ExtendedFaultBase<TErrorClass> & InstanceType<TErrorClass> & WithBaseFaultMethods
} {
  type ErrorClassType = TErrorClass

  const ExtendedFaultBaseClass = class extends (ErrorClass as new (...args: any[]) => Error) {
    tag: FaultTag | "No fault tag set" = "No fault tag set"
    context: Record<string, unknown> = {}
    debug?: string
    declare cause?: Error

    constructor(...args: ConstructorParameters<ErrorClassType>) {
      super(...args)
      Object.defineProperty(this, IS_FAULT, {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false,
      })
    }

    withTag<T extends FaultTag>(
      tag: T
    ): ExtendedTaggedFault<TErrorClass, T> & InstanceType<TErrorClass> & WithBaseFaultMethods {
      return new ExtendedTaggedFaultClass(this, tag) as unknown as ExtendedTaggedFault<
        TErrorClass,
        T
      > &
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
    ): ExtendedFaultBase<TErrorClass> & InstanceType<TErrorClass> & WithBaseFaultMethods {
      return new ExtendedFaultBaseClass(...args) as ExtendedFaultBase<TErrorClass> &
        InstanceType<TErrorClass> &
        WithBaseFaultMethods
    }
  }

  type ExtendedFaultInstance = InstanceType<typeof ExtendedFaultBaseClass>

  const ExtendedTaggedFaultClass = class extends ExtendedFaultBaseClass {
    override tag: FaultTag | "No fault tag set" = "No fault tag set"
    override context: Record<string, unknown> = {}

    constructor(fault: ExtendedFaultInstance, tag: FaultTag, context?: ContextForTag<FaultTag>) {
      const args = Array.from({ length: ErrorClass.length }).fill(
        void 0
      ) as ConstructorParameters<ErrorClassType>
      super(...args)

      this.tag = tag
      this.context = (context ?? {}) as Record<string, unknown>
      this.message = fault.message
      this.name = fault.name
      this.cause = fault.cause
      this.debug = fault.debug

      if (fault.stack) {
        this.stack = fault.stack
      }

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
      : ExtendedTaggedFault<TErrorClass, FaultTag> &
          InstanceType<TErrorClass> &
          WithBaseFaultMethods {
      return new ExtendedTaggedFaultClass(
        this,
        this.tag as FaultTag,
        context
      ) as unknown as ExtendedTaggedFault<TErrorClass, FaultTag> &
        InstanceType<TErrorClass> &
        WithBaseFaultMethods
    }

    clearContext(): ExtendedTaggedFault<TErrorClass, FaultTag> &
      InstanceType<TErrorClass> &
      WithBaseFaultMethods {
      return new ExtendedTaggedFaultClass(
        this,
        this.tag as FaultTag
      ) as unknown as ExtendedTaggedFault<TErrorClass, FaultTag> &
        InstanceType<TErrorClass> &
        WithBaseFaultMethods
    }
  }

  const descriptors = Object.getOwnPropertyDescriptors(BaseFault.prototype)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key !== "constructor" && !(key in ExtendedFaultBaseClass.prototype)) {
      Object.defineProperty(ExtendedFaultBaseClass.prototype, key, descriptor)
    }
  }

  return ExtendedFaultBaseClass as unknown as {
    new (
      ...args: ConstructorParameters<TErrorClass>
    ): ExtendedFaultBase<TErrorClass> & InstanceType<TErrorClass> & WithBaseFaultMethods
    create(
      ...args: ConstructorParameters<TErrorClass>
    ): ExtendedFaultBase<TErrorClass> & InstanceType<TErrorClass> & WithBaseFaultMethods
  }
}
