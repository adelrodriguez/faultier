import { RegistryTagMismatchError } from "./errors"
import { Fault } from "./fault"
import { dispatchTag, dispatchTags, type HandlerResult } from "./match"
import { type AnyFaultCtor, setRegistryState } from "./registry-state"
import { deserializeFault } from "./reviver"
import { normalizeThrown, type SerializableFault } from "./wire"

type FaultCtorEntry = readonly [string, AnyFaultCtor]

type ConstructorFields<Ctor extends AnyFaultCtor> = ConstructorParameters<Ctor>[0]

type CreateArgs<Ctor extends AnyFaultCtor> =
  undefined extends ConstructorFields<Ctor>
    ? [fields?: Exclude<ConstructorFields<Ctor>, undefined>]
    : [fields: ConstructorFields<Ctor>]

type RegistryMatchHandlers<M extends Record<string, AnyFaultCtor>> = Partial<{
  [K in keyof M]: (fault: InstanceType<M[K]>) => unknown
}>

// Registry policy for serializing arbitrary caught values: Faults encode
// themselves; anything else is wrapped in an UnknownError/UnknownThrown envelope.
function toSerializableValue(value: unknown): SerializableFault {
  if (value instanceof Fault) {
    return value.toSerializable()
  }

  if (value instanceof Error) {
    return {
      __faultier: true,
      _tag: "UnknownError",
      cause: {
        kind: "error",
        message: value.message,
        name: value.name,
        stack: value.stack,
      },
      message: value.message,
      name: "UnknownError",
    }
  }

  return {
    __faultier: true,
    _tag: "UnknownThrown",
    cause: { kind: "thrown", value: normalizeThrown(value) },
    message: "UnknownThrown",
    name: "UnknownThrown",
  }
}

function constructFault(ctor: AnyFaultCtor, args: unknown[]): Fault {
  const value: unknown = Reflect.construct(ctor, args)

  if (!(value instanceof Fault)) {
    throw new Error("Invalid Fault constructor: expected Fault instance")
  }

  return value
}

function instantiate<Ctor extends AnyFaultCtor>(ctor: Ctor, args: unknown[]): InstanceType<Ctor> {
  // Safe: constructFault validates the instance; this preserves the specific constructor type.
  // oxlint-disable-next-line typescript/no-unsafe-return
  return constructFault(ctor, args) as InstanceType<Ctor>
}

export type FaultRegistry<M extends Record<string, AnyFaultCtor>> = {
  readonly tags: ReadonlyArray<keyof M>
  create<K extends keyof M>(tag: K, ...args: CreateArgs<M[K]>): InstanceType<M[K]>
  wrap(cause: unknown): {
    as<K extends keyof M>(tag: K, ...args: CreateArgs<M[K]>): InstanceType<M[K]>
  }
  is(this: void, err: unknown): err is InstanceType<M[keyof M]>
  matchTag<RH, K extends keyof M>(
    this: void,
    err: unknown,
    tag: K,
    handler: (e: InstanceType<M[K]>) => RH
  ): RH | undefined
  matchTag<RH, RF, K extends keyof M>(
    this: void,
    err: unknown,
    tag: K,
    handler: (e: InstanceType<M[K]>) => RH,
    fallback: (err: unknown) => RF
  ): RH | RF
  matchTags<const H extends RegistryMatchHandlers<M>>(
    this: void,
    err: unknown,
    handlers: H
  ): HandlerResult<H> | undefined
  matchTags<const H extends RegistryMatchHandlers<M>, RF>(
    this: void,
    err: unknown,
    handlers: H,
    fallback: (err: unknown) => RF
  ): HandlerResult<H> | RF
  toSerializable(err: unknown): SerializableFault
  fromSerializable(json: SerializableFault): InstanceType<M[keyof M]> | Fault
}

export function registry<const M extends Record<string, AnyFaultCtor>>(ctors: M): FaultRegistry<M> {
  return createRegistry(ctors, Object.entries(ctors))
}

export function registryFromEntries(
  entries: readonly FaultCtorEntry[]
): FaultRegistry<Record<string, AnyFaultCtor>> {
  const ctors: Record<string, AnyFaultCtor> = {}
  for (const [tag, ctor] of entries) {
    ctors[tag] = ctor
  }
  return createRegistry(ctors, entries)
}

function createRegistry<const M extends Record<string, AnyFaultCtor>>(
  ctors: M,
  entries: readonly FaultCtorEntry[]
): FaultRegistry<M> {
  const tagToCtor = new Map<string, AnyFaultCtor>()
  const tags: string[] = []

  for (const [registryKey, ctor] of entries) {
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
    // Safe: instantiate() validates the instance and preserves the selected constructor type.
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

  function matchTag<RH, K extends keyof M>(
    this: void,
    err: unknown,
    tag: K,
    handler: (e: InstanceType<M[K]>) => RH
  ): RH | undefined
  function matchTag<RH, RF, K extends keyof M>(
    this: void,
    err: unknown,
    tag: K,
    handler: (e: InstanceType<M[K]>) => RH,
    fallback: (err: unknown) => RF
  ): RH | RF
  function matchTag<RH, RF, K extends keyof M>(
    this: void,
    err: unknown,
    tag: K,
    handler: (e: InstanceType<M[K]>) => RH,
    fallback?: (err: unknown) => RF
  ): RH | RF | undefined {
    if (!is(err)) return fallback?.(err)
    return dispatchTag(err, tag, handler, fallback) as RH | RF | undefined
  }

  function matchTags<const H extends RegistryMatchHandlers<M>>(
    this: void,
    err: unknown,
    handlers: H
  ): HandlerResult<H> | undefined
  function matchTags<const H extends RegistryMatchHandlers<M>, RF>(
    this: void,
    err: unknown,
    handlers: H,
    fallback: (err: unknown) => RF
  ): HandlerResult<H> | RF
  function matchTags<const H extends RegistryMatchHandlers<M>, RF>(
    this: void,
    err: unknown,
    handlers: H,
    fallback?: (err: unknown) => RF
  ): HandlerResult<H> | RF | undefined {
    if (!is(err)) return fallback?.(err)
    return dispatchTags(err, handlers, fallback) as HandlerResult<H> | RF | undefined
  }

  const instance: FaultRegistry<M> = {
    tags,

    create,

    wrap(cause: unknown) {
      return {
        as<K extends keyof M>(tag: K, ...args: CreateArgs<M[K]>): InstanceType<M[K]> {
          // Safe: create() returns the selected Fault subtype, whose fluent methods preserve `this`.
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
        return ctor ? constructFault(ctor, [payload]) : undefined
      })
    },
  }

  setRegistryState(instance, { tagToCtor })

  return instance
}
