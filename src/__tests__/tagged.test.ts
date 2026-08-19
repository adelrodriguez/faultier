import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { ReservedFieldError } from "../errors"
import { Fault, Tagged } from "../index"

describe("Tagged", () => {
  it("creates class with matching _tag and name", () => {
    class NotFoundError extends Tagged("NotFoundError")<{ resource: string }>() {}

    const fault = new NotFoundError({ resource: "user" })

    expect(fault).toBeInstanceOf(Fault)
    expect(fault._tag).toBe("NotFoundError")
    expect(fault.name).toBe("NotFoundError")
  })

  it("assigns constructor fields to instance", () => {
    class NotFoundError extends Tagged("NotFoundError")<{ id: string; resource: string }>() {}

    const fault = new NotFoundError({ id: "123", resource: "user" })

    expect(fault.id).toBe("123")
    expect(fault.resource).toBe("user")
  })

  it("throws ReservedFieldError for reserved field keys", () => {
    class InvalidFieldError extends Tagged("InvalidFieldError")<{ message: string }>() {}

    expect(() => new InvalidFieldError({ message: "nope" })).toThrow(ReservedFieldError)
    expect(() => new InvalidFieldError({ message: "nope" })).toThrow("Reserved field key: message")
  })

  it("throws ReservedFieldError for Fault method names", () => {
    class InvalidFieldError extends Tagged("InvalidFieldError")<{ unwrap: string }>() {}

    expect(() => new InvalidFieldError({ unwrap: "nope" })).toThrow(ReservedFieldError)
  })

  it("throws ReservedFieldError for inherited prototype member names", () => {
    class InvalidFieldError extends Tagged("InvalidFieldError")<{ toString: string }>() {}

    expect(() => new InvalidFieldError({ toString: "nope" })).toThrow(ReservedFieldError)
  })

  it("throws ReservedFieldError for the __proto__ key", () => {
    class InvalidFieldError extends Tagged("InvalidFieldError")() {}

    const fields = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, never>

    expect(() => new InvalidFieldError(fields)).toThrow(ReservedFieldError)
  })

  it("throws ReservedFieldError for the __faultier marker key", () => {
    class InvalidFieldError extends Tagged("InvalidFieldError")<{ __faultier: boolean }>() {}

    expect(() => new InvalidFieldError({ __faultier: false })).toThrow(ReservedFieldError)
  })

  it("accepts no constructor arguments for empty fields", () => {
    class TimeoutError extends Tagged("TimeoutError")() {}

    const fault = new TimeoutError()

    expect(fault._tag).toBe("TimeoutError")
  })

  it("rejects a field key exactly when it collides with the wire envelope or Fault prototype", () => {
    // Test-side mirror of the internal isReservedKey rule; if the library's
    // rule ever drifts from this, the property fails.
    const wireEnvelopeKeys = new Set([
      "__faultier",
      "_tag",
      "cause",
      "name",
      "message",
      "stack",
      "meta",
      "details",
    ])
    class ProbeError extends Tagged("ProbeError")<Record<string, string>>() {}

    // Random strings almost never land on a reserved key, so mix them in
    // explicitly to make the rejection branch reliable in every run.
    const keyArb = fc.oneof(
      fc.string({ maxLength: 30, minLength: 1 }),
      fc.constantFrom(
        ...wireEnvelopeKeys,
        "toString",
        "valueOf",
        "constructor",
        "__proto__",
        "unwrap",
        "withMeta"
      )
    )

    fc.assert(
      fc.property(keyArb, (key) => {
        const construct = () => new ProbeError({ [key]: "value" })

        if (wireEnvelopeKeys.has(key) || key in Fault.prototype) {
          expect(construct).toThrow(ReservedFieldError)
        } else {
          const fault = construct() as unknown as Record<string, unknown>
          expect(fault[key]).toBe("value")
        }
      })
    )
  })
})
