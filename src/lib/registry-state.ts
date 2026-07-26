import type { Fault } from "./fault"

export type AnyFaultCtor = new (...args: never[]) => Fault

type RegistryState = {
  readonly tagToCtor: ReadonlyMap<string, AnyFaultCtor>
}

const registryStates = new WeakMap<object, RegistryState>()

export function setRegistryState(registry: object, state: RegistryState): void {
  registryStates.set(registry, state)
}

export function getRegistryState(registry: object): RegistryState {
  const state = registryStates.get(registry)

  if (!state) {
    throw new TypeError("Invalid Fault registry")
  }

  return state
}
