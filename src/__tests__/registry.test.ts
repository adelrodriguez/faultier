import { describe, expect, it } from "bun:test"

import type { SerializableFault } from "../index"
import { Fault, registry, RegistryTagMismatchError, Tagged } from "../index"

class NotFoundError extends Tagged("NotFoundError")<{ id: string }>() {}
class TimeoutError extends Tagged("TimeoutError")() {}

describe("registry", () => {
  it("throws when registry key does not match constructor tag", () => {
    class TimeoutErrorAlias extends Tagged("TimeoutError")() {}

    expect(() =>
      registry({
        NotFoundError,
        WrongTagName: TimeoutErrorAlias,
      })
    ).toThrow(RegistryTagMismatchError)
  })

  it("creates tagged faults by tag", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const fault = Faults.create("NotFoundError", { id: "123" })

    expect(fault).toBeInstanceOf(NotFoundError)
    expect(fault.id).toBe("123")
  })

  it("creates wrapped faults using wrap().as", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const cause = new Error("root")

    const fault = Faults.wrap(cause).as("TimeoutError")

    expect(fault).toBeInstanceOf(TimeoutError)
    expect(fault.cause).toBe(cause)
  })

  it("matches top-level tag only", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const fault = Faults.create("NotFoundError", { id: "123" })

    const value = Faults.matchTag(
      fault,
      "NotFoundError",
      (e) => e.id,
      () => "fallback"
    )

    expect(value).toBe("123")
  })

  it("supports destructured matchTag", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const { matchTag } = Faults
    const fault = Faults.create("NotFoundError", { id: "123" })

    const value = matchTag(
      fault,
      "NotFoundError",
      (e) => e.id,
      () => "fallback"
    )

    expect(value).toBe("123")
  })

  it("uses fallback for non-fault values", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const value = Faults.matchTag(
      "oops",
      "NotFoundError",
      () => "match" as const,
      () => "fallback" as const
    )

    expect(value).toBe("fallback")
  })

  it("returns undefined without fallback", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const fault = Faults.create("TimeoutError")

    const value = Faults.matchTag(fault, "NotFoundError", () => "match" as const)

    expect(value).toBeUndefined()
  })

  it("restores subclass from registry.fromSerializable", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const original = Faults.create("NotFoundError", { id: "123" }).withMessage("Missing user")

    const serialized = original.toSerializable()
    const restored = Faults.fromSerializable(serialized)

    expect(restored).toBeInstanceOf(NotFoundError)
    expect((restored as NotFoundError).id).toBe("123")
    expect(restored.message).toBe("Missing user")
  })

  it("restores nested fault causes with registry.fromSerializable", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const cause = Faults.create("TimeoutError").withMessage("Timed out")
    const original = Faults.create("NotFoundError", { id: "123" })
      .withMessage("Missing user")
      .withCause(cause)

    const restored = Faults.fromSerializable(original.toSerializable())

    expect(restored).toBeInstanceOf(NotFoundError)
    expect(restored.cause).toBeInstanceOf(TimeoutError)
    expect((restored.cause as TimeoutError).message).toBe("Timed out")
  })

  it("serializes unknown errors as UnknownError", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const serialized = Faults.toSerializable(new Error("boom"))

    expect(serialized._tag).toBe("UnknownError")
    expect(serialized.cause?.kind).toBe("error")
  })

  it("serializes non-Error thrown values as UnknownThrown", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const serializedString = Faults.toSerializable("boom")
    const serializedNumber = Faults.toSerializable(42)
    const serializedNull = Faults.toSerializable(null)

    expect(serializedString._tag).toBe("UnknownThrown")
    expect(serializedString.cause).toEqual({ kind: "thrown", value: "boom" })
    expect(serializedNumber.cause).toEqual({ kind: "thrown", value: 42 })
    expect(serializedNull.cause).toEqual({ kind: "thrown", value: null })
  })

  it("identifies members with registry.is", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const fault = Faults.create("TimeoutError")

    expect(Faults.is(fault)).toBe(true)
    expect(Faults.is(new Error("x"))).toBe(false)
  })

  it("supports destructured is", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const { is } = Faults

    expect(is(Faults.create("TimeoutError"))).toBe(true)
    expect(is(new Error("plain"))).toBe(false)
  })

  it("returns false from registry.is for faults from other registries", () => {
    const AppFaults = registry({ NotFoundError })

    class PaymentError extends Tagged("PaymentError")() {}
    const BillingFaults = registry({ PaymentError })
    const billingFault = BillingFaults.create("PaymentError")

    expect(AppFaults.is(billingFault)).toBe(false)
  })

  it("supports matchTags handler map", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const fault = Faults.create("TimeoutError")

    const value = Faults.matchTags(
      fault,
      {
        TimeoutError: () => "timeout" as const,
      },
      () => "fallback" as const
    )

    expect(value).toBe("timeout")
  })

  it("supports destructured matchTags", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const { matchTags } = Faults
    const fault = Faults.create("TimeoutError")

    const value = matchTags(
      fault,
      {
        TimeoutError: () => "timeout" as const,
      },
      () => "fallback" as const
    )

    expect(value).toBe("timeout")
  })

  it("returns undefined from matchTags without fallback", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const fault = Faults.create("NotFoundError", { id: "123" })

    const value = Faults.matchTags(fault, {
      TimeoutError: () => "timeout" as const,
    })

    expect(value).toBeUndefined()
  })

  it("uses fallback in matchTags when no handler matches", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const fault = Faults.create("NotFoundError", { id: "123" })

    const value = Faults.matchTags(
      fault,
      {
        TimeoutError: () => "timeout" as const,
      },
      () => "fallback" as const
    )

    expect(value).toBe("fallback")
  })

  it("falls back to base fromSerializable for unknown tag", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const restored = Faults.fromSerializable({
      __faultier: true,
      _tag: "Other",
      message: "other",
      name: "Other",
    })

    expect(restored).toBeInstanceOf(Fault)
    expect(restored).not.toBeInstanceOf(NotFoundError)
  })

  it("caps deep nested registry cause chains during deserialization", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    let current: SerializableFault = {
      __faultier: true,
      _tag: "TimeoutError",
      name: "TimeoutError",
    }

    for (let i = 0; i < 150; i += 1) {
      current = {
        __faultier: true,
        _tag: "NotFoundError",
        cause: { kind: "fault", value: current },
        id: `${i}`,
        name: "NotFoundError",
      }
    }

    const restored = Faults.fromSerializable(current)
    expect(restored).toBeInstanceOf(NotFoundError)

    let node = restored
    let depth = 0
    while (node.cause instanceof Fault) {
      depth += 1
      node = node.cause
    }

    expect(depth).toBeLessThanOrEqual(100)
  })

  it("throws when constructor does not produce a Fault instance", () => {
    // oxlint-disable-next-line eslint/no-extraneous-class
    class NotAFault {
      static readonly _tag = "NotAFault"
    }

    const Faults = registry({ NotAFault } as never)

    expect(() =>
      (Faults as never as { create: (tag: string) => unknown }).create("NotAFault")
    ).toThrow("Invalid Fault constructor")
  })
})
