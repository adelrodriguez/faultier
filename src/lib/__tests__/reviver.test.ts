import { isDeepStrictEqual } from "node:util"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { InvalidPayloadError } from "../errors"
import { Fault, isReservedKey, toSerializable } from "../fault"
import { fromSerializable, isSerializableFault } from "../reviver"
import { MAX_CAUSE_DEPTH, RESERVED_FAULT_KEYS, type SerializableFault } from "../wire"

const PAYLOAD_PREFIX_PATTERN = /^(?:__payload_)+$/

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

// A reserved key together with its own __payload_-prefixed twin forces two
// wire keys to rename onto the same target, exercising the collision-dedup
// guard in preparePayload (a random dictionary almost never produces this).
const collisionPairArb = fc
  .constantFrom("toString", "unwrap", "withMeta", "flatten", "__proto__")
  .map((key) => ({ [key]: "reserved-value", [`__payload_${key}`]: "prefixed-value" }))

const wirePayloadArb = fc
  .tuple(
    fc.dictionary(wireKeyArb, fc.jsonValue({ maxDepth: 2 }), { maxKeys: 6 }),
    fc.option(collisionPairArb, { nil: undefined })
  )
  .map(([payload, collisionPair]) => {
    if (collisionPair === undefined) return payload

    // defineProperty (not assignment or Object.assign) so a "__proto__" key
    // lands as an own data property instead of triggering the setter.
    for (const [key, value] of Object.entries(collisionPair)) {
      Object.defineProperty(payload, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      })
    }

    return payload
  })

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

// Test-side mirror of the envelope validation order, so each input has
// exactly one expected outcome.
function expectedRejection(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return "expected __faultier: true"

  const record = input as Record<string, unknown>
  if (record.__faultier !== true) return "expected __faultier: true"
  if (typeof record._tag !== "string") return "_tag must be a string"
  if (
    "meta" in record
    && record.meta !== undefined
    && (typeof record.meta !== "object" || record.meta === null)
  ) {
    return "meta must be an object"
  }

  return undefined
}

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

// Arbitrary values almost never carry `__faultier: true`, so mix in
// envelope-shaped objects to exercise the revive branch and each
// validation guard (marker, _tag, meta) in every run.
const envelopeArb = fc.record(
  {
    __faultier: fc.oneof(fc.constant(true), anythingArb),
    _tag: fc.oneof(fc.string(), anythingArb),
    meta: fc.oneof(fc.dictionary(fc.string(), fc.jsonValue()), anythingArb),
  },
  { requiredKeys: ["__faultier", "_tag"] }
)

const payloadCandidateArb = fc.oneof(anythingArb, envelopeArb)

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

        // No data loss: exactly one restored key per wire payload key.
        const payloadOwnKeys = ownKeys.filter((key) => !RESERVED_FAULT_KEYS.has(key))
        expect(payloadOwnKeys.length).toBe(Object.keys(payload).length)

        for (const [key, value] of Object.entries(payload)) {
          // Renamed keys never land on a raw wire key, so a non-reserved key
          // is always restored under its exact original name.
          if (!isReservedKey(key)) {
            expect(Object.hasOwn(revived, key)).toBe(true)
            expect(isDeepStrictEqual(revivedRecord[key], value)).toBe(true)
            continue
          }

          // Reserved keys are reachable under a __payload_-prefixed rename.
          const matches = payloadOwnKeys.filter(
            (candidate) =>
              candidate.endsWith(key)
              && PAYLOAD_PREFIX_PATTERN.test(candidate.slice(0, -key.length))
              && isDeepStrictEqual(revivedRecord[candidate], value)
          )

          expect(matches.length).toBeGreaterThan(0)
        }
      })
    )
  })

  it("revives valid envelopes and rejects invalid input with the matching validation error", () => {
    fc.assert(
      fc.property(payloadCandidateArb, (input) => {
        const rejection = expectedRejection(input)
        const revive = () => fromSerializable(input as SerializableFault)

        if (rejection === undefined) {
          const revived = revive()

          expect(revived).toBeInstanceOf(Fault)
          expect(revived._tag).toBe((input as SerializableFault)._tag)
        } else {
          expect(revive).toThrow(InvalidPayloadError)
          expect(revive).toThrow(expect.objectContaining({ reason: rejection }))
        }
      })
    )
  })
})

// Envelopes with every typed field and a cause, where each may be malformed,
// including a nested fault envelope that only fails its own validation.
const causeArb = fc.oneof(
  anythingArb,
  fc.record({ kind: fc.constant("fault"), value: fc.oneof(envelopeArb, anythingArb) }),
  fc.record(
    {
      kind: fc.constant("error"),
      message: fc.oneof(fc.string(), anythingArb),
      name: fc.oneof(fc.string(), anythingArb),
      stack: fc.oneof(fc.string(), anythingArb),
    },
    { requiredKeys: ["kind"] }
  ),
  fc.record({ kind: fc.constant("thrown"), value: anythingArb })
)

const wireCandidateArb = fc.oneof(
  payloadCandidateArb,
  fc.record(
    {
      __faultier: fc.constant(true),
      _tag: fc.string(),
      cause: causeArb,
      details: fc.oneof(fc.string(), anythingArb),
      message: fc.oneof(fc.string(), anythingArb),
      meta: fc.dictionary(fc.string(), fc.jsonValue()),
      name: fc.oneof(fc.string(), anythingArb),
      stack: fc.oneof(fc.string(), anythingArb),
    },
    { requiredKeys: ["__faultier", "_tag"] }
  )
)

class ProbeFault extends Fault {
  constructor() {
    super("ProbeFault")
  }
}

const caughtArb = fc.oneof(
  anythingArb,
  anythingArb.map((cause) => new Error("caught", { cause })),
  anythingArb.map((cause) =>
    new ProbeFault().withCause(new Error("mid", { cause: new ProbeFault().withCause(cause) }))
  )
)

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string"
}

function wrapInFaultEdges(innermost: unknown, edges: number): unknown {
  let wire = innermost
  for (let depth = 0; depth < edges; depth += 1) {
    wire = { __faultier: true, _tag: "X", cause: { kind: "fault", value: wire }, name: "X" }
  }
  return wire
}

function wrapInErrorEdges(innermost: unknown, edges: number): unknown {
  let cause = innermost
  for (let depth = 0; depth < edges; depth += 1) {
    cause = { cause, kind: "error", message: "m", name: "E" }
  }
  return { __faultier: true, _tag: "X", cause, name: "X" }
}

describe("isSerializableFault", () => {
  it("never accepts input that fromSerializable rejects", () => {
    fc.assert(
      fc.property(wireCandidateArb, (input) => {
        if (isSerializableFault(input)) {
          expect(() => fromSerializable(input)).not.toThrow()
        }
      })
    )
  })

  it("only accepts envelopes whose typed fields match SerializableFault", () => {
    fc.assert(
      fc.property(wireCandidateArb, (input) => {
        if (!isSerializableFault(input)) return

        expect(typeof input.name).toBe("string")
        expect(isOptionalString(input.message)).toBe(true)
        expect(isOptionalString(input.details)).toBe(true)
        expect(isOptionalString(input.stack)).toBe(true)
      })
    )
  })

  it("accepts every payload toSerializable produces, before and after JSON transport", () => {
    fc.assert(
      fc.property(caughtArb, (caught) => {
        const serialized = toSerializable(caught)
        const body = JSON.stringify(serialized)
        const transported: unknown = JSON.parse(body)

        expect(isSerializableFault(serialized)).toBe(true)
        expect(isSerializableFault(transported)).toBe(true)
      })
    )
  })

  it("accepts serializer output for chains longer than the depth budget", () => {
    let faultChain: unknown = new Error("root")
    let errorChain: unknown = new Error("root")

    for (let depth = 0; depth < MAX_CAUSE_DEPTH + 20; depth += 1) {
      faultChain = new ProbeFault().withCause(faultChain)
      errorChain = new Error(`e${depth}`, { cause: errorChain })
    }

    for (const caught of [faultChain, errorChain]) {
      const body = JSON.stringify(toSerializable(caught))
      const transported: unknown = JSON.parse(body)

      expect(isSerializableFault(transported)).toBe(true)
    }
  })

  it("rejects any cause left past the depth budget, valid or not", () => {
    const leaf = { __faultier: true, _tag: "X", name: "X" }

    expect(isSerializableFault(wrapInFaultEdges(leaf, MAX_CAUSE_DEPTH))).toBe(true)
    expect(
      isSerializableFault(wrapInFaultEdges({ ...leaf, cause: { kind: "fault" } }, MAX_CAUSE_DEPTH))
    ).toBe(false)
    expect(
      isSerializableFault(wrapInErrorEdges({ kind: "thrown", value: 1 }, MAX_CAUSE_DEPTH - 1))
    ).toBe(true)
    expect(isSerializableFault(wrapInErrorEdges(null, MAX_CAUSE_DEPTH))).toBe(false)
    expect(
      isSerializableFault(wrapInErrorEdges({ kind: "thrown", value: 1 }, MAX_CAUSE_DEPTH))
    ).toBe(false)
  })
})
