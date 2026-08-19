import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { Fault, isReservedKey } from "../fault"
import { RESERVED_FAULT_KEYS } from "../wire"

class ProbeFault extends Fault {
  constructor() {
    super("ProbeFault")
  }
}

describe("isReservedKey", () => {
  it("reserves every wire envelope key", () => {
    for (const key of RESERVED_FAULT_KEYS) {
      expect(isReservedKey(key)).toBe(true)
    }
  })

  it("reserves every property reachable through Fault's prototype chain", () => {
    let proto: object | null = ProbeFault.prototype

    while (proto !== null) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        expect(isReservedKey(key)).toBe(true)
      }
      proto = Object.getPrototypeOf(proto) as object | null
    }
  })

  it("controls exactly which own fields serialization includes as payload", () => {
    // oxlint-disable-next-line typescript/unbound-method -- always invoked with an explicit receiver via .call below.
    const toSerializable = Fault.prototype.toSerializable

    fc.assert(
      fc.property(
        fc.string({ maxLength: 30, minLength: 1 }),
        fc.jsonValue({ maxDepth: 2 }),
        (key, value) => {
          const fault = new ProbeFault()
          Object.defineProperty(fault, key, {
            configurable: true,
            enumerable: true,
            value,
            writable: true,
          })

          // Call via the prototype: the generated key may shadow instance methods.
          const serialized = toSerializable.call(fault)

          if (!isReservedKey(key)) {
            expect(Object.hasOwn(serialized, key)).toBe(true)
            expect(serialized[key]).toEqual(value as (typeof serialized)[string])
          } else if (!RESERVED_FAULT_KEYS.has(key)) {
            // Prototype-derived reserved keys (Fault methods, Error/Object
            // built-ins) must never leak into the wire object; envelope keys
            // are legitimately present.
            expect(Object.hasOwn(serialized, key)).toBe(false)
          }
        }
      )
    )
  })
})
