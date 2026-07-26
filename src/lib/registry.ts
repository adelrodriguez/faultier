import type { SerializableFault } from "./serialize"
import { RegistryTagMismatchError } from "./errors"
import { Fault } from "./fault"
import { deserializeFault, toSerializableValue } from "./serialize"

type AnyFaultCtor = new (...args: never[]) => Fault

type ConstructorFields<Ctor extends AnyFaultCtor> = ConstructorParameters<Ctor>[0]

type CreateArgs<Ctor extends AnyFaultCtor> =
  undefined extends ConstructorFields<Ctor>
    ? [fields?: Exclude<ConstructorFields<Ctor>, undefined>]
    : [fields: ConstructorFields<Ctor>]

function instantiate<Ctor extends AnyFaultCtor>(ctor: Ctor, args: unknown[]): InstanceType<Ctor> {
  const value = Reflect.construct(ctor as unknown as new (...innerArgs: unknown[]) => unknown, args)

  if (!(value instanceof Fault)) {
    throw new Error("Invalid Fault constructor: expected Fault instance")
  }

  // Safe: runtime guard above guarantees we only return Fault instances.
  // The generic cast bridges Reflect.construct to the caller's ctor instance type.
  // oxlint-disable-next-line typescript/no-unsafe-return
  return value as InstanceType<Ctor>
}

export type FaultRegistry<M extends Record<string, AnyFaultCtor>> = {
  readonly tags: ReadonlyArray<keyof M>
  create<K extends keyof M>(tag: K, ...args: CreateArgs<M[K]>): InstanceType<M[K]>
  wrap(cause: unknown): {
    as<K extends keyof M>(tag: K, ...args: CreateArgs<M[K]>): InstanceType<M[K]>
  }
  is(this: void, err: unknown): err is InstanceType<M[keyof M]>
  matchTag<R, K extends keyof M>(
    this: void,
    err: unknown,
    tag: K,
    handler: (e: InstanceType<M[K]>) => R
  ): R | undefined
  matchTag<R, K extends keyof M>(
    this: void,
    err: unknown,
    tag: K,
    handler: (e: InstanceType<M[K]>) => R,
    fallback: (err: unknown) => R
  ): R
  matchTags<R>(
    this: void,
    err: unknown,
    handlers: Partial<{ [K in keyof M]: (e: InstanceType<M[K]>) => R }>
  ): R | undefined
  matchTags<R>(
    this: void,
    err: unknown,
    handlers: Partial<{ [K in keyof M]: (e: InstanceType<M[K]>) => R }>,
    fallback: (err: unknown) => R
  ): R
  toSerializable(err: unknown): SerializableFault
  fromSerializable(json: SerializableFault): InstanceType<M[keyof M]> | Fault
  readonly __faultier: {
    readonly tagToCtor: Map<string, AnyFaultCtor>
    readonly tags: readonly string[]
  }
}

export function registry<const M extends Record<string, AnyFaultCtor>>(ctors: M): FaultRegistry<M> {
  const tagToCtor = new Map<string, AnyFaultCtor>()
  const tags: string[] = []

  for (const [registryKey, ctor] of Object.entries(ctors)) {
    const ctorTag = (ctor as { _tag?: unknown })._tag
    if (ctorTag !== registryKey) {
      throw new RegistryTagMismatchError({
        ctorTag: typeof ctorTag === "string" ? ctorTag : String(ctorTag),
        registryKey,
      })
    }

    tagToCtor.set(registryKey, ctor)
    tags.push(registryKey)
  }

  function create<K extends keyof M>(tag: K, ...args: CreateArgs<M[K]>): InstanceType<M[K]> {
    const ctor = ctors[tag]
    // Safe: instantiate() performs runtime Fault validation and returns the exact ctor instance.
    // oxlint-disable-next-line typescript/no-unsafe-return
    return instantiate(ctor, args as unknown[])
  }

  function is(err: unknown): err is InstanceType<M[keyof M]> {
    if (!(err instanceof Fault)) return false
    for (const ctor of tagToCtor.values()) {
      if (err instanceof ctor) return true
    }
    return false
  }

  function matchTag<R, K extends keyof M>(
    this: void,
    err: unknown,
    tag: K,
    handler: (e: InstanceType<M[K]>) => R
  ): R | undefined
  function matchTag<R, K extends keyof M>(
    this: void,
    err: unknown,
    tag: K,
    handler: (e: InstanceType<M[K]>) => R,
    fallback: (err: unknown) => R
  ): R
  function matchTag<R, K extends keyof M>(
    this: void,
    err: unknown,
    tag: K,
    handler: (e: InstanceType<M[K]>) => R,
    fallback?: (err: unknown) => R
  ): R | undefined {
    if (is(err) && err._tag === tag) {
      return handler(err)
    }
    return fallback?.(err)
  }

  function matchTags<R>(
    this: void,
    err: unknown,
    handlers: Partial<{ [K in keyof M]: (e: InstanceType<M[K]>) => R }>
  ): R | undefined
  function matchTags<R>(
    this: void,
    err: unknown,
    handlers: Partial<{ [K in keyof M]: (e: InstanceType<M[K]>) => R }>,
    fallback: (err: unknown) => R
  ): R
  function matchTags<R>(
    this: void,
    err: unknown,
    handlers: Partial<{ [K in keyof M]: (e: InstanceType<M[K]>) => R }>,
    fallback?: (err: unknown) => R
  ): R | undefined {
    if (is(err)) {
      const maybeHandler = handlers[err._tag as keyof M]
      if (typeof maybeHandler === "function") {
        return maybeHandler(err)
      }
    }
    return fallback?.(err)
  }

  const instance: FaultRegistry<M> = {
    tags,

    create,

    wrap(cause: unknown) {
      return {
        as<K extends keyof M>(tag: K, ...args: CreateArgs<M[K]>): InstanceType<M[K]> {
          // Safe: create() returns a Fault subtype and withCause is defined on Fault.
          // oxlint-disable-next-line typescript/no-unsafe-return, typescript/no-unsafe-call
          return create(tag, ...args).withCause(cause)
        },
      }
    },

    is,

    matchTag,

    matchTags,

    toSerializable(err: unknown): SerializableFault {
      return toSerializableValue(err)
    },

    fromSerializable(json: SerializableFault): InstanceType<M[keyof M]> | Fault {
      return deserializeFault(json, (tag, payload) => {
        const ctor = tagToCtor.get(tag)
        // Safe: instantiate() validates that registered constructors return Fault instances.
        // oxlint-disable-next-line typescript/no-unsafe-return
        return ctor ? instantiate(ctor, [payload]) : undefined
      })
    },

    __faultier: {
      tagToCtor,
      tags,
    },
  }

  return instance
}
