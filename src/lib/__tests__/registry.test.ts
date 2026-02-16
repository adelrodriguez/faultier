import { describe, expect, test } from "bun:test"

import type { SerializableFault } from "../fault"
import { RegistryTagMismatchError } from "../errors"
import { Fault } from "../fault"
import { registry } from "../registry"
import { Tagged } from "../tagged"

class NotFoundError extends Tagged("NotFoundError")<{ id: string }>() {}
class TimeoutError extends Tagged("TimeoutError")() {}

describe("registry", () => {
  test("should throw when registry key does not match ctor tag", () => {
    class TimeoutErrorAlias extends Tagged("TimeoutError")() {}

    expect(() =>
      registry({
        NotFoundError,
        WrongTagName: TimeoutErrorAlias,
      })
    ).toThrow(RegistryTagMismatchError)
  })

  test("should create tagged faults by tag", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const fault = Faults.create("NotFoundError", { id: "123" })

    expect(fault).toBeInstanceOf(NotFoundError)
    expect(fault.id).toBe("123")
  })

  test("should create wrapped faults using wrap().as", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const cause = new Error("root")

    const fault = Faults.wrap(cause).as("TimeoutError")

    expect(fault).toBeInstanceOf(TimeoutError)
    expect(fault.cause).toBe(cause)
  })

  test("should match top-level tag only", () => {
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

  test("should support destructured matchTag", () => {
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

  test("should use fallback for non-fault values", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const value = Faults.matchTag(
      "oops",
      "NotFoundError",
      () => "match" as const,
      () => "fallback" as const
    )

    expect(value).toBe("fallback")
  })

  test("should return undefined without fallback", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const fault = Faults.create("TimeoutError")

    const value = Faults.matchTag(fault, "NotFoundError", () => "match" as const)

    expect(value).toBeUndefined()
  })

  test("should restore subclass from registry.fromSerializable", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const original = Faults.create("NotFoundError", { id: "123" }).withMessage("Missing user")

    const serialized = original.toSerializable()
    const restored = Faults.fromSerializable(serialized)

    expect(restored).toBeInstanceOf(NotFoundError)
    expect((restored as NotFoundError).id).toBe("123")
    expect(restored.message).toBe("Missing user")
  })

  test("should restore nested fault causes with registry.fromSerializable", () => {
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

  test("should serialize unknown errors as UnknownError", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const serialized = Faults.toSerializable(new Error("boom"))

    expect(serialized._tag).toBe("UnknownError")
    expect(serialized.cause?.kind).toBe("error")
  })

  test("should serialize non-Error thrown values as UnknownThrown", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const serializedString = Faults.toSerializable("boom")
    const serializedNumber = Faults.toSerializable(42)
    const serializedNull = Faults.toSerializable(null)

    expect(serializedString._tag).toBe("UnknownThrown")
    expect(serializedString.cause).toEqual({ kind: "thrown", value: "boom" })
    expect(serializedNumber.cause).toEqual({ kind: "thrown", value: 42 })
    expect(serializedNull.cause).toEqual({ kind: "thrown", value: null })
  })

  test("should identify members with registry.is", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const fault = Faults.create("TimeoutError")

    expect(Faults.is(fault)).toBe(true)
    expect(Faults.is(new Error("x"))).toBe(false)
  })

  test("should support destructured is", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const { is } = Faults

    expect(is(Faults.create("TimeoutError"))).toBe(true)
    expect(is(new Error("plain"))).toBe(false)
  })

  test("should return false from registry.is for faults from other registries", () => {
    const AppFaults = registry({ NotFoundError })

    class PaymentError extends Tagged("PaymentError")() {}
    const BillingFaults = registry({ PaymentError })
    const billingFault = BillingFaults.create("PaymentError")

    expect(AppFaults.is(billingFault)).toBe(false)
  })

  test("should support matchTags handler map", () => {
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

  test("should support destructured matchTags", () => {
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

  test("should return undefined from matchTags without fallback", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const fault = Faults.create("NotFoundError", { id: "123" })

    const value = Faults.matchTags(fault, {
      TimeoutError: () => "timeout" as const,
    })

    expect(value).toBeUndefined()
  })

  test("should use fallback in matchTags when no handler matches", () => {
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

  test("should fallback to base fromSerializable for unknown tag", () => {
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

  test("should cap deep nested registry cause chains during deserialization", () => {
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

  test("should throw when constructor does not produce a Fault instance", () => {
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
