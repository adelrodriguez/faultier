import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { Fault, isReservedKey } from "../fault"
import { fromSerializable } from "../reviver"
import { RESERVED_FAULT_KEYS, type SerializableFault } from "../wire"

const PAYLOAD_PREFIX_PATTERN = /^(?:__payload_)+/

const wireKeyArb = fc
  .oneof(
    fc.string({ maxLength: 20, minLength: 1 }),
    fc.constantFrom(
      "toString",
      "constructor",
      "hasOwnProperty",
      "unwrap",
      "withMeta",
      "flatten",
      "__proto__"
    ),
    fc.string({ maxLength: 10, minLength: 1 }).map((key) => `__payload_${key}`)
  )
  .filter((key) => !RESERVED_FAULT_KEYS.has(key))

const wirePayloadArb = fc.dictionary(wireKeyArb, fc.jsonValue({ maxDepth: 2 }), { maxKeys: 6 })

function buildWire(payload: Record<string, unknown>): SerializableFault {
  const wire = {
    __faultier: true,
    _tag: "HostileError",
    message: "hostile payload",
    name: "HostileError",
  } as SerializableFault

  for (const [key, value] of Object.entries(payload)) {
    Object.defineProperty(wire, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  }

  return wire
}

describe("fromSerializable", () => {
  it("restores every non-envelope wire key without loss or prototype shadowing", () => {
    fc.assert(
      fc.property(wirePayloadArb, (payload) => {
        const revived = fromSerializable(buildWire(payload))
        const revivedRecord = revived as unknown as Record<string, unknown>
        const ownKeys = Object.keys(revived)

        // No own key may shadow anything reachable through the prototype
        // chain; only envelope fields (name, message, ...) may be reserved.
        for (const key of ownKeys) {
          expect(RESERVED_FAULT_KEYS.has(key) || !isReservedKey(key)).toBe(true)
        }
        expect(typeof revivedRecord.unwrap).toBe("function")

        // No data loss: exactly one restored key per wire payload key, each
        // reachable under its original name or a __payload_-prefixed rename.
        const payloadOwnKeys = ownKeys.filter((key) => !RESERVED_FAULT_KEYS.has(key))
        expect(payloadOwnKeys.length).toBe(Object.keys(payload).length)

        for (const [key, value] of Object.entries(payload)) {
          const matches = payloadOwnKeys.filter(
            (candidate) =>
              (candidate === key ||
                (PAYLOAD_PREFIX_PATTERN.test(candidate) && candidate.endsWith(key))) &&
              Bun.deepEquals(revivedRecord[candidate], value)
          )

          expect(matches.length).toBeGreaterThan(0)
        }
      })
    )
  })

  it("either revives a Fault or rejects with an invalid-payload error for any input", () => {
    const anythingArb = fc.anything({
      withBigInt: true,
      withDate: true,
      withMap: true,
      withNullPrototype: true,
      withObjectString: true,
      withSet: true,
      withSparseArray: true,
      withTypedArray: true,
    })

    fc.assert(
      fc.property(anythingArb, (input) => {
        try {
          expect(fromSerializable(input as SerializableFault)).toBeInstanceOf(Fault)
        } catch (error) {
          expect(error).toBeInstanceOf(Error)
          expect((error as Error).message).toStartWith("Invalid Faultier payload")
        }
      })
    )
  })
})
