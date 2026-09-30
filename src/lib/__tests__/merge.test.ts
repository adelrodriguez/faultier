import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { Fault } from "../fault"
import { RegistryMergeConflictError } from "../errors"
import { merge } from "../merge"
import { registry } from "../registry"
import { Tagged } from "../tagged"

class NotFoundError extends Tagged("NotFoundError")<{ id: string }>() {}
class TimeoutError extends Tagged("TimeoutError")() {}
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
