import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { SerializableFault } from "../wire"
import { RegistryMergeConflictError, RegistryTagMismatchError } from "../errors"
import { Fault } from "../fault"
import { merge, registry } from "../registry"
import { Tagged } from "../tagged"

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
    ).toThrow(
      expect.objectContaining({
        constructor: RegistryTagMismatchError,
        ctorTag: "TimeoutError",
        registryKey: "WrongTagName",
      })
    )
  })

  it("creates tagged faults by tag", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const fault = Faults.create("NotFoundError", { id: "123" })

    expect(fault).toBeInstanceOf(NotFoundError)
    expect(fault.id).toBe("123")
  })

  it("exposes registered tags without internal state", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    expect(Faults.tags).toEqual(["NotFoundError", "TimeoutError"])
    expect("__faultier" in Faults).toBe(false)
  })

  it("creates wrapped faults using wrap().as", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const cause = new Error("root")

    const fault = Faults.wrap(cause).as("TimeoutError")

    expect(fault).toBeInstanceOf(TimeoutError)
    expect(fault.cause).toBe(cause)
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

  it("uses fallback for an unregistered constructor with a registered tag", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    class ForeignNotFoundError extends Tagged("NotFoundError")<{ id: string }>() {}
    const foreignFault = new ForeignNotFoundError({ id: "123" })
    let fallbackInput: unknown

    const value = Faults.matchTag(
      foreignFault,
      "NotFoundError",
      () => "match" as const,
      (error) => {
        fallbackInput = error
        return "fallback" as const
      }
    )

    expect(value).toBe("fallback")
    expect(fallbackInput).toBe(foreignFault)
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

  it("restores registered causes beneath unregistered faults", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const restored = Faults.fromSerializable({
      __faultier: true,
      _tag: "OtherError",
      cause: {
        kind: "fault",
        value: {
          __faultier: true,
          _tag: "TimeoutError",
          name: "TimeoutError",
        },
      },
      name: "OtherError",
    })

    expect(restored).toBeInstanceOf(Fault)
    expect(restored).not.toBeInstanceOf(TimeoutError)
    expect(restored._tag).toBe("OtherError")
    expect(restored.cause).toBeInstanceOf(TimeoutError)
  })

  it("preserves reserved payload collisions during registry deserialization", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const restored = Faults.fromSerializable({
      __faultier: true,
      __payload_withCause: "existing-value",
      _tag: "TimeoutError",
      name: "TimeoutError",
      withCause: "reserved-value",
    } as unknown as SerializableFault)

    const value = restored as unknown as Record<string, unknown>

    expect(restored).toBeInstanceOf(TimeoutError)
    expect(Object.hasOwn(restored, "withCause")).toBe(false)
    expect(value.__payload_withCause).toBe("existing-value")
    expect(value.__payload___payload_withCause).toBe("reserved-value")
  })

  it("validates registered payloads before reconstruction", () => {
    let constructorCalls = 0

    class ValidatedError extends Fault {
      static readonly _tag = "ValidatedError"

      constructor() {
        super(ValidatedError._tag)
        constructorCalls += 1
      }
    }

    const Faults = registry({ ValidatedError })

    expect(() =>
      Faults.fromSerializable({
        __faultier: false,
        _tag: "ValidatedError",
        name: "ValidatedError",
      } as unknown as SerializableFault)
    ).toThrow("Invalid Faultier payload")

    expect(() =>
      Faults.fromSerializable({
        __faultier: true,
        _tag: "ValidatedError",
        meta: "not-an-object",
        name: "ValidatedError",
      } as unknown as SerializableFault)
    ).toThrow("meta must be an object")

    expect(constructorCalls).toBe(0)
  })

  it("preserves constructor normalization during registry deserialization", () => {
    class NormalizedError extends Fault {
      static readonly _tag = "NormalizedError"
      readonly value: number

      constructor(args: { value: string }) {
        super(NormalizedError._tag)
        this.value = Number(args.value)
      }
    }

    const Faults = registry({ NormalizedError })
    const restored = Faults.fromSerializable({
      __faultier: true,
      _tag: "NormalizedError",
      name: "NormalizedError",
      value: "42",
    })

    expect(restored).toBeInstanceOf(NormalizedError)
    expect((restored as NormalizedError).value).toBe(42)
  })

  it("serializes unknown errors as UnknownError", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const error = new Error("boom")

    const serialized = Faults.toSerializable(error)

    expect(serialized).toEqual({
      __faultier: true,
      _tag: "UnknownError",
      cause: { kind: "error", message: "boom", name: "Error", stack: error.stack },
      message: "boom",
      name: "UnknownError",
    })
  })

  it("serializes non-Error thrown values as UnknownThrown", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    const serializedString = Faults.toSerializable("boom")
    const serializedNumber = Faults.toSerializable(42)
    const serializedNull = Faults.toSerializable(null)

    expect(serializedString).toEqual({
      __faultier: true,
      _tag: "UnknownThrown",
      cause: { kind: "thrown", value: "boom" },
      message: "UnknownThrown",
      name: "UnknownThrown",
    })
    expect(serializedNumber.cause).toEqual({ kind: "thrown", value: 42 })
    expect(serializedNull.cause).toEqual({ kind: "thrown", value: null })
  })

  it("normalizes non-serializable UnknownThrown values", () => {
    const Faults = registry({ NotFoundError, TimeoutError })
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic

    const serialized = Faults.toSerializable(cyclic)

    expect(serialized.cause).toEqual({ kind: "thrown", value: "[object Object]" })
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

  it("returns false from registry.is for a subclass with an unregistered tag", () => {
    class BaseFault extends Fault {
      static readonly _tag: string = "BaseFault"

      constructor() {
        super(new.target._tag)
      }
    }

    class DerivedFault extends BaseFault {
      static override readonly _tag = "DerivedFault"
    }

    const Faults = registry({ BaseFault })

    expect(Faults.is(new BaseFault())).toBe(true)
    expect(Faults.is(new DerivedFault())).toBe(false)
  })

  it("creates and wraps faults registered under numeric keys", () => {
    class NumericError extends Tagged("1")() {}
    const Faults = registry({ 1: NumericError })

    expect(Faults.create(1)).toBeInstanceOf(NumericError)
    expect(Faults.wrap(new Error("root")).as(1)).toBeInstanceOf(NumericError)
  })

  it("throws a TypeError naming the tag when create receives an unregistered tag", () => {
    const Faults = registry({ NotFoundError, TimeoutError })

    // @ts-expect-error -- exercises the runtime guard for a tag the registry does not know
    expect(() => Faults.create("Nope")).toThrow(new TypeError("Unknown Fault registry tag 'Nope'."))
    // @ts-expect-error -- an inherited Object.prototype key is not a registered tag
    expect(() => Faults.create("toString")).toThrow(
      new TypeError("Unknown Fault registry tag 'toString'.")
    )
  })

  it("uses fallback when an omitted tag matches an inherited property", () => {
    class ConstructorError extends Tagged("constructor")() {}
    const Faults = registry({ constructor: ConstructorError })
    const fault = Faults.create("constructor")

    const value = Faults.matchTags(fault, {}, () => "fallback")

    expect(value).toBe("fallback")
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
    expect(restored).not.toBeInstanceOf(TimeoutError)
    expect(restored._tag).toBe("Other")
    expect(restored.name).toBe("Other")
    expect(restored.message).toBe("other")
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

    expect(depth).toBe(100)
    expect(node).toBeInstanceOf(NotFoundError)
    expect((node as NotFoundError).id).toBe("49")
    expect(node.cause).toBeUndefined()
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

class DatabaseError extends Tagged("DatabaseError")<{ query: string }>() {}

// The registry/merge generics are designed around literal tag maps; the
// property tests below build registries from generated tags, so they go
// through this deliberately loosened surface. Runtime behavior is what's
// under test.
type DynamicRegistry = {
  readonly tags: readonly string[]
  create: (tag: string) => Fault
}

function dynamicRegistry(
  tags: readonly string[],
  ctors: ReadonlyMap<string, unknown>
): DynamicRegistry {
  const entries = Object.fromEntries(tags.map((tag) => [tag, ctors.get(tag)]))

  return registry(entries as Parameters<typeof registry>[0]) as unknown as DynamicRegistry
}

const mergeDynamic = merge as unknown as (
  ...registries: readonly DynamicRegistry[]
) => DynamicRegistry

describe("merge", () => {
  it("preserves first-seen order for integer-like tags", () => {
    class SecondError extends Tagged("2")() {}
    class FirstError extends Tagged("1")() {}

    const SecondFault = registry({ "2": SecondError })
    const FirstFault = registry({ "1": FirstError })

    expect(merge(SecondFault, FirstFault).tags).toEqual(["2", "1"])
  })

  it("creates faults whose tags collide with object and constructor properties after merging", () => {
    class PrototypeError extends Tagged("__proto__")() {}
    class LengthError extends Tagged("length")() {}

    const PrototypeFault = registry({ ["__proto__"]: PrototypeError })
    const LengthFault = registry({ length: LengthError })

    const MergedFault = merge(PrototypeFault, LengthFault)

    expect(MergedFault.tags).toEqual(["__proto__", "length"])
    expect(MergedFault.create("__proto__")).toBeInstanceOf(PrototypeError)
    expect(MergedFault.create("length")).toBeInstanceOf(LengthError)
  })

  it("rejects registry objects without internal state", () => {
    const AppFault = registry({ NotFoundError, TimeoutError })
    const DbFault = registry({ DatabaseError })
    const forged = { ...AppFault }

    expect(() => merge(forged, DbFault)).toThrow("Invalid Fault registry")
  })

  it("behaves like a normal registry", () => {
    const AppFault = registry({ NotFoundError })
    const DbFault = registry({ DatabaseError, TimeoutError })
    const MergedFault = merge(AppFault, DbFault)

    const created = MergedFault.create("DatabaseError", { query: "SELECT 1" })
    expect(created.query).toBe("SELECT 1")

    const wrapped = MergedFault.wrap(new Error("root")).as("TimeoutError")
    expect(wrapped._tag).toBe("TimeoutError")

    const matched = MergedFault.matchTag(created, "DatabaseError", (fault) => fault.query)
    expect(matched).toBe("SELECT 1")

    const serialized = MergedFault.toSerializable(created)
    const restored = MergedFault.fromSerializable(serialized)
    expect(restored).toBeInstanceOf(DatabaseError)
  })

  it("keeps first-seen tag order for any sequence of compatible registries", () => {
    const registriesArb = fc
      .uniqueArray(fc.string({ maxLength: 12, minLength: 1 }), { maxLength: 8, minLength: 3 })
      .chain((pool) =>
        fc
          .array(fc.subarray(pool, { minLength: 1 }), { maxLength: 3, minLength: 2 })
          .map((picks) => {
            const ctors = new Map(pool.map((tag) => [tag, class extends Tagged(tag)() {}]))
            return picks.map((tags) => dynamicRegistry(tags, ctors))
          })
      )

    fc.assert(
      fc.property(registriesArb, (registries) => {
        const merged = mergeDynamic(...registries)

        const expected: string[] = []
        for (const reg of registries) {
          for (const tag of reg.tags) {
            if (!expected.includes(tag)) expected.push(tag)
          }
        }

        expect(merged.tags).toEqual(expected)
      })
    )
  })

  it("is associative over compatible registries", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ maxLength: 12, minLength: 1 }), { maxLength: 6, minLength: 3 }),
        fc.infiniteStream(fc.integer({ max: 2, min: 0 })),
        (pool, assignments) => {
          const ctors = new Map(pool.map((tag) => [tag, class extends Tagged(tag)() {}]))
          const groups: string[][] = [[], [], []]
          for (const tag of pool) {
            const group = groups[assignments.next().value as number]
            group?.push(tag)
          }

          const [a, b, c] = groups.map((tags) => dynamicRegistry(tags, ctors))
          if (a === undefined || b === undefined || c === undefined) {
            throw new Error("unreachable: three groups are always created")
          }

          const left = mergeDynamic(mergeDynamic(a, b), c)
          const right = mergeDynamic(a, mergeDynamic(b, c))

          expect(left.tags).toEqual(right.tags)

          for (const tag of left.tags) {
            const expectedCtor = ctors.get(tag)
            if (expectedCtor === undefined) throw new Error("unreachable: tag comes from pool")

            expect(left.create(tag)).toBeInstanceOf(expectedCtor)
            expect(right.create(tag)).toBeInstanceOf(expectedCtor)
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it("is idempotent and throws only when a shared tag maps to a different constructor", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12, minLength: 1 }), (tag) => {
        class FirstError extends Tagged(tag)() {}
        class SecondError extends Tagged(tag)() {}

        const first = dynamicRegistry([tag], new Map([[tag, FirstError]]))
        const alias = dynamicRegistry([tag], new Map([[tag, FirstError]]))
        const conflicting = dynamicRegistry([tag], new Map([[tag, SecondError]]))

        expect(mergeDynamic(first, first).tags).toEqual([tag])
        expect(mergeDynamic(first, alias).tags).toEqual([tag])
        expect(() => mergeDynamic(first, conflicting)).toThrow(RegistryMergeConflictError)
      }),
      { numRuns: 50 }
    )
  })
})
