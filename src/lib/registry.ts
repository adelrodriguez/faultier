import type { SerializableFault } from "./fault"
import { RegistryTagMismatchError } from "./errors"
import { Fault } from "./fault"
import {
  deserializeCause,
  extractPayloadFields,
  fromSerializable as fromSerializableBase,
  restoreDeserializedFields,
} from "./serialize"
import { RESERVED_KEYS } from "./utils"

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

function toUnknownErrorSerializable(error: Error): SerializableFault {
  return {
    __faultier: true,
    _tag: "UnknownError",
    cause: {
      kind: "error",
      message: error.message,
      name: error.name,
      stack: error.stack,
    },
    message: error.message,
    name: "UnknownError",
  }
}

function toUnknownThrownSerializable(value: unknown): SerializableFault {
  return {
    __faultier: true,
    _tag: "UnknownThrown",
    cause: { kind: "thrown", value },
    message: "UnknownThrown",
    name: "UnknownThrown",
  }
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
    handler: (e: InstanceType<M[K]>) => R,
    fallback?: (err: unknown) => R
  ): R | undefined
  matchTags<R>(
    this: void,
    err: unknown,
    handlers: Partial<{ [K in keyof M]: (e: InstanceType<M[K]>) => R }>,
    fallback?: (err: unknown) => R
  ): R | undefined
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
    const ctor = ctors[tag] as M[K]
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

  const instance: FaultRegistry<M> = {
    tags: tags as ReadonlyArray<keyof M>,

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

    matchTag<R, K extends keyof M>(
      this: void,
      err: unknown,
      tag: K,
      handler: (e: InstanceType<M[K]>) => R,
      fallback?: (err: unknown) => R
    ): R | undefined {
      if (is(err) && err._tag === tag) {
        return handler(err as InstanceType<M[K]>)
      }
      return fallback?.(err)
    },

    matchTags<R>(
      this: void,
      err: unknown,
      handlers: Partial<{ [K in keyof M]: (e: InstanceType<M[K]>) => R }>,
      fallback?: (err: unknown) => R
    ): R | undefined {
      if (is(err)) {
        const maybeHandler = handlers[err._tag as keyof M]
        if (typeof maybeHandler === "function") {
          return maybeHandler(err as never)
        }
      }
      return fallback?.(err)
    },

    toSerializable(err: unknown): SerializableFault {
      if (err instanceof Fault) {
        return err.toSerializable()
      }

      if (err instanceof Error) {
        return toUnknownErrorSerializable(err)
      }

      return toUnknownThrownSerializable(err)
    },

    fromSerializable(json: SerializableFault): InstanceType<M[keyof M]> | Fault {
      // Safe: fromSerializableInternal enforces the same return contract.
      // oxlint-disable-next-line typescript/no-unsafe-return
      return fromSerializableInternal(json, 0)
    },

    __faultier: {
      tagToCtor,
      tags,
    },
  }

  function fromSerializableInternal(
    json: SerializableFault,
    depth: number
  ): InstanceType<M[keyof M]> | Fault {
    const ctor = tagToCtor.get(json._tag)

    if (!ctor) {
      return fromSerializableBase(json)
    }

    const rawPayload = extractPayloadFields(json)
    const payload: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(rawPayload)) {
      if (!RESERVED_KEYS.has(key)) payload[key] = value
    }
    const created = instantiate(ctor, [payload]) as Fault
    restoreDeserializedFields(created, json)

    if (json.cause) {
      // Intentionally assign cause directly instead of withCause().
      // Serialized stacks already contain any prior "Caused by:" enhancement.
      created.cause = deserializeCause(
        json.cause,
        (value) => fromSerializableInternal(value, depth + 1),
        depth
      )
    }

    // Safe: `created` comes from the registered ctor for `json._tag`, so it matches registry union.
    // oxlint-disable-next-line typescript/no-unsafe-return
    return created
  }

  return instance
}
