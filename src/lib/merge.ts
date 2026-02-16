import type { Fault } from "./fault"
import type { FaultRegistry } from "./registry"
import { RegistryMergeConflictError } from "./errors"
import { registry } from "./registry"

type AnyFaultCtor = new (...args: never[]) => Fault

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

function toCtorRecord(tagToCtor: Map<string, AnyFaultCtor>): Record<string, AnyFaultCtor> {
  const record: Record<string, AnyFaultCtor> = {}
  for (const [tag, ctor] of tagToCtor) {
    record[tag] = ctor
  }
  return record
}

export function merge<
  const Registries extends readonly [AnyFaultRegistry, AnyFaultRegistry, ...AnyFaultRegistry[]],
>(...registries: Registries): MergedRegistry<Registries> {
  const tagToCtor = new Map<string, AnyFaultCtor>()
  const orderedTags: string[] = []

  for (const current of registries) {
    for (const tag of current.__faultier.tags) {
      const ctor = current.__faultier.tagToCtor.get(tag)

      if (!ctor) continue

      if (!tagToCtor.has(tag)) {
        tagToCtor.set(tag, ctor)
        orderedTags.push(tag)
        continue
      }

      const existing = tagToCtor.get(tag)
      if (existing !== ctor) {
        throw new RegistryMergeConflictError({ conflictingTag: tag })
      }
    }
  }

  const merged = registry(toCtorRecord(tagToCtor))

  return {
    ...merged,
    __faultier: {
      ...merged.__faultier,
      tags: orderedTags,
    },
    tags: orderedTags,
  } as MergedRegistry<Registries>
}
