import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import type { SerializableFault, SerializableValue } from "../types"
import { Fault, fromSerializable, Tagged } from "../index"

// Test-side mirror of the internal isReservedKey rule: wire envelope keys
// (documented in CONTEXT.md) plus anything reachable through Fault's
// prototype chain. The reserved-key properties below keep this mirror honest —
// if the library's rule drifts, they fail.
const WIRE_ENVELOPE_KEYS = new Set([
  "__faultier",
  "_tag",
  "cause",
  "name",
  "message",
  "stack",
  "meta",
  "details",
])

function isReservedMirror(key: string): boolean {
  return WIRE_ENVELOPE_KEYS.has(key) || key in Fault.prototype
}

// Canonicalized through one JSON round trip because the wire itself is JSON:
// fc.jsonValue() can generate -0, which JSON.stringify canonicalizes to 0 (a
// documented transport semantic, not a faultier defect), and deep equality
// distinguishes -0 from 0.
const jsonValueArb = fc
  .jsonValue({ maxDepth: 3 })
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- structuredClone preserves -0; the point is JSON's canonicalization.
  .map((value) => JSON.parse(JSON.stringify(value)) as SerializableValue)

const payloadKeyArb = fc
  .string({ maxLength: 25, minLength: 1 })
  .filter((key) => !isReservedMirror(key))

const payloadArb = fc.dictionary(payloadKeyArb, jsonValueArb, { maxKeys: 5 })

const metaArb = fc.dictionary(payloadKeyArb, jsonValueArb, { maxKeys: 3 })

const tagArb = fc.string({ maxLength: 30, minLength: 1 })

type FaultSpec = {
  tag: string
  message: string | undefined
  details: string | undefined
  meta: Record<string, SerializableValue> | undefined
  payload: Record<string, SerializableValue>
  cause: CauseSpec | undefined
}

type CauseSpec =
  | { kind: "fault"; value: FaultSpec }
  | { kind: "error"; message: string }
  | { kind: "thrown"; value: SerializableValue }

const { faultSpecArb } = fc.letrec<{ faultSpecArb: FaultSpec; causeSpecArb: CauseSpec }>((tie) => ({
  causeSpecArb: fc.oneof(
    { depthSize: "small" },
    fc.record({ kind: fc.constant("thrown" as const), value: jsonValueArb }),
    fc.record({ kind: fc.constant("error" as const), message: fc.string() }),
    fc.record({ kind: fc.constant("fault" as const), value: tie("faultSpecArb") })
  ),
  faultSpecArb: fc.record({
    cause: fc.option(tie("causeSpecArb"), { nil: undefined }),
    details: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    message: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    meta: fc.option(metaArb, { nil: undefined }),
    payload: payloadArb,
    tag: tagArb,
  }),
}))

function buildFault(spec: FaultSpec): Fault {
  class GeneratedFault extends Tagged(spec.tag)<Record<string, SerializableValue>>() {}
  const fault = new GeneratedFault(spec.payload)

  if (spec.message !== undefined) fault.withMessage(spec.message)
  if (spec.details !== undefined) fault.withDetails(spec.details)
  if (spec.meta !== undefined) fault.withMeta(spec.meta)

  if (spec.cause !== undefined) {
    if (spec.cause.kind === "fault") fault.withCause(buildFault(spec.cause.value))
    else if (spec.cause.kind === "error") fault.withCause(new Error(spec.cause.message))
    else fault.withCause(spec.cause.value)
  }

  return fault
}

function transport(value: Fault | SerializableFault): SerializableFault {
  // Intentionally a JSON round-trip: the properties under test cover transport
  // over a real wire, not structuredClone semantics.
  // oxlint-disable-next-line unicorn/prefer-structured-clone
  return JSON.parse(JSON.stringify(value)) as SerializableFault
}

describe("toSerializable", () => {
  it("serializes own payload fields alongside reserved fields", () => {
    class NotFoundError extends Tagged("NotFoundError")<{ id: string; resource: string }>() {}

    const fault = new NotFoundError({ id: "123", resource: "user" })
      .withMessage("User not found")
      .withDetails("lookup failed")
      .withMeta({ requestId: "req-1" })

    const serialized = fault.toSerializable()

    expect(serialized.__faultier).toBe(true)
    expect(serialized._tag).toBe("NotFoundError")
    expect(serialized.id).toBe("123")
    expect(serialized.resource).toBe("user")
    expect(serialized.message).toBe("User not found")
    expect(serialized.details).toBe("lookup failed")
    expect(serialized.meta).toEqual({ requestId: "req-1" })
  })

  it("preserves undefined values in the wire object while JSON applies standard semantics", () => {
    class UndefinedValueError extends Tagged("UndefinedValueError")() {}

    const serialized = new UndefinedValueError()
      .withMeta({ items: [1, undefined, 2], missing: undefined })
      .toSerializable()

    expect(Object.hasOwn(serialized.meta ?? {}, "missing")).toBe(true)
    expect(serialized.meta?.missing).toBeUndefined()
    expect(serialized.meta?.items).toEqual([1, undefined, 2])

    // Intentionally use a JSON round-trip to validate JSON transport semantics.
    // oxlint-disable-next-line unicorn/prefer-structured-clone
    const json = JSON.parse(JSON.stringify(serialized)) as { meta: Record<string, unknown> }

    expect(Object.hasOwn(json.meta, "missing")).toBe(false)
    expect(json.meta.items).toEqual([1, null, 2])
  })

  it("normalizes thrown functions", () => {
    class FunctionCauseError extends Tagged("FunctionCauseError")() {}

    const serialized = new FunctionCauseError().withCause(() => "ignored").toSerializable()

    expect(serialized.cause).toEqual({ kind: "thrown", value: "[Function]" })
  })

  it("normalizes thrown symbols", () => {
    class SymbolCauseError extends Tagged("SymbolCauseError")() {}

    const serialized = new SymbolCauseError().withCause(Symbol("reason")).toSerializable()

    expect(serialized.cause).toEqual({ kind: "thrown", value: "reason" })
  })

  it("normalizes thrown bigints", () => {
    class BigIntCauseError extends Tagged("BigIntCauseError")() {}

    const serialized = new BigIntCauseError().withCause(42n).toSerializable()

    expect(serialized.cause).toEqual({ kind: "thrown", value: "42" })
  })

  it("normalizes non-finite thrown numbers to null", () => {
    class NumberCauseError extends Tagged("NumberCauseError")() {}

    for (const nonFinite of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const serialized = new NumberCauseError().withCause(nonFinite).toSerializable()

      expect(serialized.cause).toEqual({ kind: "thrown", value: null })
    }

    const finite = new NumberCauseError().withCause(42).toSerializable()

    expect(finite.cause).toEqual({ kind: "thrown", value: 42 })
  })

  it("normalizes thrown objects through JSON", () => {
    class ObjectCauseError extends Tagged("ObjectCauseError")() {}
    const date = new Date("2026-01-02T03:04:05.000Z")

    const plainObject = new ObjectCauseError().withCause({ code: 42, nested: { retry: true } })
    const dateObject = new ObjectCauseError().withCause(date)

    expect(plainObject.toSerializable().cause).toEqual({
      kind: "thrown",
      value: { code: 42, nested: { retry: true } },
    })
    expect(dateObject.toSerializable().cause).toEqual({ kind: "thrown", value: date.toJSON() })
  })

  it("normalizes cyclic thrown causes for JSON round-trips", () => {
    class CyclicCauseError extends Tagged("CyclicCauseError")() {}
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    const fault = new CyclicCauseError().withCause(cyclic)

    expect(fault.toSerializable().cause).toEqual({ kind: "thrown", value: "[object Object]" })

    // Intentionally stringify the Fault instance to exercise its toJSON wire format.
    // oxlint-disable-next-line unicorn/prefer-structured-clone
    const restored = fromSerializable(JSON.parse(JSON.stringify(fault)) as SerializableFault)

    expect(restored.cause).toBe("[object Object]")
  })

  it("survives any thrown cause, and the result always revives", () => {
    class SurvivorError extends Tagged("SurvivorError")() {}

    fc.assert(
      fc.property(
        fc.anything({
          withBigInt: true,
          withDate: true,
          withMap: true,
          withNullPrototype: true,
          withObjectString: true,
          withSet: true,
          withSparseArray: true,
          withTypedArray: true,
        }),
        (thrown) => {
          const fault = new SurvivorError().withCause(thrown)
          const revived = fromSerializable(transport(fault))

          expect(revived._tag).toBe("SurvivorError")
        }
      )
    )
  })
})

describe("fromSerializable", () => {
  it("round-trips nested fault causes recursively", () => {
    class DatabaseError extends Tagged("DatabaseError")<{ query: string }>() {}
    class ServiceError extends Tagged("ServiceError")<{ endpoint: string }>() {}

    const leaf = new DatabaseError({ query: "SELECT 1" }).withMessage("db failed")
    const head = new ServiceError({ endpoint: "/users" }).withMessage("svc failed").withCause(leaf)

    const serialized = head.toSerializable()
    const deserialized = fromSerializable(serialized)

    expect(deserialized._tag).toBe("ServiceError")
    expect(deserialized.cause).toBeInstanceOf(Fault)

    const cause = deserialized.cause as Fault
    expect(cause._tag).toBe("DatabaseError")
    expect((cause as unknown as { query: string }).query).toBe("SELECT 1")
  })

  it("deserializes a serialized Fault payload", () => {
    class NotFoundError extends Tagged("NotFoundError")<{ id: string; resource: string }>() {}

    const original = new NotFoundError({ id: "123", resource: "user" })
      .withMessage("User not found")
      .withDetails("db query failed")
      .withMeta({ requestId: "req-1" })
      .withCause(new Error("root"))

    const serialized = original.toSerializable()
    const deserialized = fromSerializable(serialized)

    expect(deserialized).toBeInstanceOf(Fault)
    expect(deserialized._tag).toBe("NotFoundError")
    expect(deserialized.message).toBe("User not found")
    expect(deserialized.details).toBe("db query failed")
    expect(deserialized.meta).toEqual({ requestId: "req-1" })
    expect((deserialized as unknown as { id: string }).id).toBe("123")
    expect((deserialized as unknown as { resource: string }).resource).toBe("user")
    expect(deserialized.cause).toBeInstanceOf(Error)
  })

  it("throws for invalid payloads", () => {
    expect(() => fromSerializable({ __faultier: false } as unknown as SerializableFault)).toThrow(
      "Invalid Faultier payload"
    )
  })

  it("rewrites payload keys that collide with reserved names", () => {
    const deserialized = fromSerializable({
      __faultier: true,
      _tag: "CollisionError",
      name: "CollisionError",
      withCause: "payload-value",
    } as unknown as SerializableFault)

    const value = deserialized as unknown as Record<string, unknown>

    expect(typeof deserialized.withCause).toBe("function")
    expect(value.__payload_withCause).toBe("payload-value")
    expect(value.withCause).not.toBe("payload-value")
  })

  it("preserves existing keys that use the collision prefix", () => {
    const deserialized = fromSerializable({
      __faultier: true,
      __payload_withCause: "existing-value",
      _tag: "CollisionError",
      name: "CollisionError",
      withCause: "reserved-value",
    } as unknown as SerializableFault)

    const value = deserialized as unknown as Record<string, unknown>

    expect(value.__payload_withCause).toBe("existing-value")
    expect(value.__payload___payload_withCause).toBe("reserved-value")
  })

  it("preserves prototype-sensitive payload keys without changing the prototype", () => {
    const payload = JSON.parse(
      '{"__faultier":true,"_tag":"PrototypeError","name":"PrototypeError","__proto__":"payload-value"}'
    ) as SerializableFault

    const deserialized = fromSerializable(payload)
    const baseline = fromSerializable({
      __faultier: true,
      _tag: "PrototypeError",
      name: "PrototypeError",
    })
    const value = deserialized as unknown as Record<string, unknown>

    expect(Object.getPrototypeOf(deserialized)).toBe(Object.getPrototypeOf(baseline))
    expect(value.__payload___proto__).toBe("payload-value")
    expect(Object.hasOwn(deserialized, "__proto__")).toBe(false)
  })

  it("deserializes thrown causes", () => {
    const deserialized = fromSerializable({
      __faultier: true,
      _tag: "ThrownCauseError",
      cause: {
        kind: "thrown",
        value: 42,
      },
      name: "ThrownCauseError",
    })

    expect(deserialized._tag).toBe("ThrownCauseError")
    expect(deserialized.cause).toBe(42)
  })

  it("supports JSON round-trip before deserialization", () => {
    class ApiError extends Tagged("ApiError")<{ endpoint: string }>() {}

    const original = new ApiError({ endpoint: "/users" })
      .withMessage("Request failed")
      .withDetails("upstream timeout")
      .withMeta({ traceId: "trace-123" })
      .withCause(new Error("root"))

    const serialized = original.toSerializable()
    // Intentionally use JSON round-trip here to validate wire-format behavior.
    // oxlint-disable-next-line unicorn/prefer-structured-clone
    const jsonSafe = JSON.parse(JSON.stringify(serialized)) as SerializableFault
    const restored = fromSerializable(jsonSafe)

    expect(restored._tag).toBe("ApiError")
    expect(restored.message).toBe("Request failed")
    expect(restored.details).toBe("upstream timeout")
    expect(restored.meta).toEqual({ traceId: "trace-123" })
    expect((restored as unknown as { endpoint: string }).endpoint).toBe("/users")
    expect(restored.cause).toBeInstanceOf(Error)
  })

  it("avoids stack overflow for deeply nested cause chains", () => {
    // Build a payload 150 levels deep — beyond MAX_CAUSE_DEPTH (100)
    let current: SerializableFault = {
      __faultier: true,
      _tag: "LeafError",
      message: "leaf",
      name: "LeafError",
    }

    for (let i = 0; i < 150; i += 1) {
      current = {
        __faultier: true,
        _tag: "WrapperError",
        cause: { kind: "fault", value: current },
        name: "WrapperError",
      }
    }

    // Walk the deserialized chain — it should be capped, not 150 deep
    const result = fromSerializable(current)
    expect(result._tag).toBe("WrapperError")

    let node = result
    let depth = 0
    while (node.cause instanceof Fault) {
      depth += 1
      node = node.cause
    }

    expect(depth).toBeLessThanOrEqual(100)
  })

  it("throws when meta is not an object", () => {
    expect(() =>
      fromSerializable({
        __faultier: true,
        _tag: "TestError",
        meta: "not-an-object",
        name: "TestError",
      } as unknown as SerializableFault)
    ).toThrow("meta must be an object")
  })

  it("preserves tag, message, details, meta, and payload across any JSON transport round trip", () => {
    fc.assert(
      fc.property(faultSpecArb, (spec) => {
        const fault = buildFault(spec)
        const revived = fromSerializable(transport(fault))

        expect(revived._tag).toBe(fault._tag)
        expect(revived.message).toBe(fault.message)
        expect(revived.details).toEqual(fault.details)
        expect(revived.meta).toEqual(fault.meta)

        const revivedRecord = revived as unknown as Record<string, unknown>
        for (const [key, value] of Object.entries(spec.payload)) {
          expect(revivedRecord[key]).toEqual(value)
        }
      })
    )
  })

  it("preserves the tag chain and merged context for any cause chain", () => {
    fc.assert(
      fc.property(faultSpecArb, (spec) => {
        const fault = buildFault(spec)
        const revived = fromSerializable(transport(fault))

        expect(revived.getTags()).toEqual(fault.getTags())
        expect(revived.getContext()).toEqual(fault.getContext())
      })
    )
  })

  it("re-serializes a revived fault to the same wire object", () => {
    fc.assert(
      fc.property(faultSpecArb, (spec) => {
        const fault = buildFault(spec)
        const wire = transport(fault)
        const revived = fromSerializable(wire)

        expect(transport(revived)).toEqual(wire)
      })
    )
  })

  it("caps revived cause chains at the documented depth of 100", () => {
    fc.assert(
      fc.property(fc.integer({ max: 150, min: 0 }), (edges) => {
        class LinkError extends Tagged("LinkError")<{ index: number }>() {}

        let fault: Fault = new LinkError({ index: 0 })
        for (let index = 1; index <= edges; index += 1) {
          fault = new LinkError({ index }).withCause(fault)
        }

        const revived = fromSerializable(transport(fault))

        expect(revived.getTags()).toEqual(fault.getTags())
        expect(revived.unwrap().length).toBe(Math.min(edges + 1, 101))
      }),
      { numRuns: 30 }
    )
  })

  it("renames hostile wire keys instead of dropping their values", () => {
    const hostileKeyArb = fc
      .oneof(
        fc.string({ maxLength: 25, minLength: 1 }),
        fc.constantFrom("toString", "unwrap", "withMeta", "__proto__", "constructor"),
        fc.string({ maxLength: 15, minLength: 1 }).map((key) => `__payload_${key}`)
      )
      .filter((key) => !WIRE_ENVELOPE_KEYS.has(key))

    fc.assert(
      fc.property(hostileKeyArb, jsonValueArb, (key, value) => {
        const wire = {
          __faultier: true,
          _tag: "HostileError",
          message: "hostile payload",
          name: "HostileError",
        } as SerializableFault
        Object.defineProperty(wire, key, { enumerable: true, value })

        const revived = fromSerializable(transport(wire))
        const restored = Object.entries(revived).filter(
          ([revivedKey]) => revivedKey === key || /^(?:__payload_)+/.test(revivedKey)
        )

        // The value must be reachable under the original key or a
        // __payload_-prefixed rename — never silently dropped.
        expect(restored.some(([, restoredValue]) => Bun.deepEquals(restoredValue, value))).toBe(
          true
        )
      })
    )
  })
})
