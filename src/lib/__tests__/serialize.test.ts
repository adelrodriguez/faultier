import { describe, expect, test } from "bun:test"

import type { SerializableFault } from "../fault"
import { Fault } from "../fault"
import { fromSerializable } from "../serialize"
import { Tagged } from "../tagged"

describe("toSerializable", () => {
  test("should serialize own payload fields alongside reserved fields", () => {
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
})

describe("fromSerializable", () => {
  test("should round-trip nested fault causes recursively", () => {
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

  test("should deserialize a serialized Fault payload", () => {
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

  test("should throw for invalid payloads", () => {
    expect(() => fromSerializable({ __faultier: false } as unknown as SerializableFault)).toThrow(
      "Invalid Faultier payload"
    )
  })

  test("should rewrite payload keys that collide with reserved names", () => {
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

  test("should deserialize thrown causes", () => {
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

  test("should support JSON round-trip before deserialization", () => {
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

  test("should not stack overflow for deeply nested cause chains", () => {
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

  test("should throw when meta is not an object", () => {
    expect(() =>
      fromSerializable({
        __faultier: true,
        _tag: "TestError",
        meta: "not-an-object" as unknown as Record<string, unknown>,
        name: "TestError",
      })
    ).toThrow("meta must be an object")
  })
})
