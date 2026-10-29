import type { SerializableFault } from "./wire"
import { RegistryMergeConflictError, RegistryTagMismatchError } from "./errors"
import { Fault, toSerializable } from "./fault"
import { dispatchTag, dispatchTags, type HandlerResult } from "./match"
import { deserializeFault } from "./reviver"

type AnyFaultCtor = new (...args: never[]) => Fault

// Each registry's constructor map, keyed by the registry object, so merge can
// read it without exposing it on the public registry surface.
const registryTagToCtors = new WeakMap<object, ReadonlyMap<string, AnyFaultCtor>>()

type FaultCtorEntry = readonly [string, AnyFaultCtor]

type ConstructorFields<Ctor extends AnyFaultCtor> = ConstructorParameters<Ctor>[0]

type CreateArgs<Ctor extends AnyFaultCtor> =
  undefined extends ConstructorFields<Ctor>
    ? [fields?: Exclude<ConstructorFields<Ctor>, undefined>]
    : [fields: ConstructorFields<Ctor>]

type RegistryMatchHandlers<M extends Record<string, AnyFaultCtor>> = Partial<{
  [K in keyof M]: (fault: InstanceType<M[K]>) => unknown
}>

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
  /**
   * Type-only union of the registry's fault instances, for `typeof Registry.Type`.
   * It is `undefined` at runtime.
   */
  readonly Type: InstanceType<M[keyof M]>
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

// fromSerializable revives a registered fault with `new Ctor(payloadFields)`,
// so a registered constructor must take the fields object as its only
// parameter. Anything else fails here instead of corrupting fields on revive.
// The check is signature-only on purpose. Looking at instance keys to catch
// more cases misses `private` fields and falsely rejects getters, which the
// type system cannot tell apart from data fields.
type RevivableCtor<Ctor extends AnyFaultCtor> =
  ConstructorParameters<Ctor> extends [fields?: object]
    ? Ctor
    : "Registered constructors must take the fields object as their only parameter"

type RevivableCtors<M extends Record<string, AnyFaultCtor>> = {
  [K in keyof M]: RevivableCtor<M[K]>
}

export function registry<const M extends Record<string, AnyFaultCtor>>(
  ctors: M & RevivableCtors<M>
): FaultRegistry<M> {
  return createRegistry<M>(Object.entries(ctors))
}

function createRegistry<const M extends Record<string, AnyFaultCtor>>(
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
    const ctor = tagToCtor.get(String(tag))
    if (!ctor) {
      throw new TypeError(`Unknown Fault registry tag '${String(tag)}'.`)
    }
    // Safe: instantiate() validates the instance and preserves the selected constructor type.
    // oxlint-disable-next-line typescript/no-unsafe-return
    return instantiate(ctor, args as unknown[])
  }

  function is(err: unknown): err is InstanceType<M[keyof M]> {
    if (!(err instanceof Fault)) return false
    const ctor = tagToCtor.get(err._tag)
    return ctor !== undefined && err instanceof ctor
  }

  // The overloads are declared once, on FaultRegistry; `instance` checks these against them.
  function matchTag(
    this: void,
    err: unknown,
    tag: PropertyKey,
    handler: (e: never) => unknown,
    fallback?: (err: unknown) => unknown
  ): unknown {
    if (!is(err)) return fallback?.(err)
    return dispatchTag(err, tag, handler, fallback)
  }

  function matchTags(
    this: void,
    err: unknown,
    handlers: object,
    fallback?: (err: unknown) => unknown
  ): unknown {
    if (!is(err)) return fallback?.(err)
    return dispatchTags(err, handlers, fallback)
  }

  const instance: Omit<FaultRegistry<M>, "Type"> = {
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

    toSerializable,

    fromSerializable(json: SerializableFault): InstanceType<M[keyof M]> | Fault {
      return deserializeFault(json, (tag, payload) => {
        const ctor = tagToCtor.get(tag)
        return ctor ? constructFault(ctor, [payload]) : undefined
      })
    },
  }

  // Safe: Type is a phantom member that exists only at the type level.
  const faultRegistry = instance as FaultRegistry<M>
  registryTagToCtors.set(faultRegistry, tagToCtor)

  return faultRegistry
}

type AnyFaultRegistry = FaultRegistry<Record<string, AnyFaultCtor>>

type RegistryCtorMap<M extends AnyFaultRegistry> = M extends FaultRegistry<infer MM> ? MM : never

type MergeCtorMaps<
  Registries extends readonly AnyFaultRegistry[],
  Acc extends Record<string, AnyFaultCtor> = Record<never, never>,
> = Registries extends readonly [
  infer Head extends AnyFaultRegistry,
  ...infer Tail extends readonly AnyFaultRegistry[],
]
  ? MergeCtorMaps<Tail, Acc & RegistryCtorMap<Head>>
  : Acc

type MergedRegistry<
  Registries extends readonly [AnyFaultRegistry, AnyFaultRegistry, ...AnyFaultRegistry[]],
> = FaultRegistry<MergeCtorMaps<Registries>>

export function merge<
  const Registries extends readonly [AnyFaultRegistry, AnyFaultRegistry, ...AnyFaultRegistry[]],
>(...registries: Registries): MergedRegistry<Registries> {
  const tagToCtor = new Map<string, AnyFaultCtor>()

  for (const current of registries) {
    const currentTagToCtor = registryTagToCtors.get(current)
    if (!currentTagToCtor) {
      throw new TypeError("Invalid Fault registry")
    }

    for (const [tag, ctor] of currentTagToCtor) {
      if (!tagToCtor.has(tag)) {
        tagToCtor.set(tag, ctor)
        continue
      }

      const existing = tagToCtor.get(tag)
      if (existing !== ctor) {
        throw new RegistryMergeConflictError({ conflictingTag: tag })
      }
    }
  }

  return createRegistry([...tagToCtor])
}
