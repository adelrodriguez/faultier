import { describe, expect, it } from "bun:test"

import type { SerializableFault } from "../types"
import { Fault, fromSerializable, Tagged } from "../index"

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
})
