import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import type { Fault } from "../index"
import { RegistryMergeConflictError } from "../errors"
import { merge, registry, Tagged } from "../index"

class NotFoundError extends Tagged("NotFoundError")<{ id: string }>() {}
class TimeoutError extends Tagged("TimeoutError")() {}
class DatabaseError extends Tagged("DatabaseError")<{ query: string }>() {}
class PaymentError extends Tagged("PaymentError")<{ invoiceId: string }>() {}
class TimeoutConflictError extends Tagged("TimeoutError")<{ retryable: boolean }>() {}

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
  it("throws for conflicting duplicate tags", () => {
    const AppFault = registry({ NotFoundError, TimeoutError })
    const DbFault = registry({
      DatabaseError,
      TimeoutError: TimeoutConflictError,
    })

    expect(() => merge(AppFault, DbFault)).toThrow(RegistryMergeConflictError)
  })

  it("allows duplicate tags when constructor reference is identical", () => {
    const AppFault = registry({ NotFoundError, TimeoutError })
    const SharedFault = registry({ TimeoutError })

    const MergedFault = merge(AppFault, SharedFault)

    expect(MergedFault.tags).toEqual(["NotFoundError", "TimeoutError"])
  })

  it("preserves deterministic tag order", () => {
    const AppFault = registry({ NotFoundError, TimeoutError })
    const DbFault = registry({ DatabaseError, TimeoutError })

    const MergedFault = merge(AppFault, DbFault)

    expect(MergedFault.tags).toEqual(["NotFoundError", "TimeoutError", "DatabaseError"])
  })

  it("preserves first-seen order for integer-like tags", () => {
    class SecondError extends Tagged("2")() {}
    class FirstError extends Tagged("1")() {}

    const SecondFault = registry({ "2": SecondError })
    const FirstFault = registry({ "1": FirstError })

    expect(merge(SecondFault, FirstFault).tags).toEqual(["2", "1"])
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

  it("keeps type-safe create inference for three or more merged modules", () => {
    const AppFault = registry({ NotFoundError, TimeoutError })
    const DbFault = registry({ DatabaseError })
    const BillingFault = registry({ PaymentError })

    const MergedFault = merge(AppFault, DbFault, BillingFault)

    const paymentFault = MergedFault.create("PaymentError", { invoiceId: "inv_123" })
    expect(paymentFault.invoiceId).toBe("inv_123")

    const dbFault = MergedFault.create("DatabaseError", { query: "SELECT 1" })
    expect(dbFault.query).toBe("SELECT 1")

    const appFault = MergedFault.create("NotFoundError", { id: "123" })
    expect(appFault.id).toBe("123")
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
