import type { AnyFaultCtor } from "./internal"
import type { FaultRegistry } from "./registry"
import { RegistryMergeConflictError } from "./errors"
import { getRegistryState } from "./internal"
import { registryFromEntries } from "./registry"

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
    for (const [tag, ctor] of getRegistryState(current).tagToCtor) {
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

  return registryFromEntries([...tagToCtor])
}
