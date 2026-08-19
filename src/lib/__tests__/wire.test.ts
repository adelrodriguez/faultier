import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { collectPayloadFields, normalizeThrown } from "../wire"

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

describe("normalizeThrown", () => {
  it("never throws for any input", () => {
    fc.assert(
      fc.property(anythingArb, (value) => {
        expect(() => normalizeThrown(value)).not.toThrow()
      })
    )
  })

  it("produces output that survives a JSON round trip identically", () => {
    fc.assert(
      fc.property(anythingArb, (value) => {
        const normalized = normalizeThrown(value)

        // undefined is the one non-JSON output, produced only for undefined input.
        if (normalized === undefined) {
          expect(value).toBeUndefined()
          return
        }

        // oxlint-disable-next-line unicorn/prefer-structured-clone -- the invariant under test is JSON transport stability.
        expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized)
      })
    )
  })

  it("is idempotent", () => {
    fc.assert(
      fc.property(anythingArb, (value) => {
        const once = normalizeThrown(value)

        expect(normalizeThrown(once)).toEqual(once)
      })
    )
  })

  it("normalizes non-finite numbers to null and keeps finite numbers", () => {
    fc.assert(
      fc.property(fc.double(), (value) => {
        const normalized = normalizeThrown(value)

        if (Number.isFinite(value)) {
          expect(Object.is(normalized, value === 0 ? 0 : value)).toBe(true)
        } else {
          expect(normalized).toBeNull()
        }
      })
    )
  })

  it("canonicalizes -0 to 0 like JSON.stringify", () => {
    expect(Object.is(normalizeThrown(-0), 0)).toBe(true)
  })
})

describe("collectPayloadFields", () => {
  it("keeps exactly the non-excluded fields in source order with identical values", () => {
    const sourceArb = fc.dictionary(fc.string({ maxLength: 20 }), anythingArb, { maxKeys: 8 })

    fc.assert(
      fc.property(
        sourceArb.chain((source) =>
          fc.record({
            excluded: fc.subarray(Object.keys(source)),
            source: fc.constant(source),
          })
        ),
        ({ excluded, source }) => {
          const excludedSet = new Set(excluded)
          const payload = collectPayloadFields(source, (key) => excludedSet.has(key))

          const expectedKeys = Object.keys(source).filter(
            (key) => !excludedSet.has(key) && typeof source[key] !== "function"
          )

          expect(Object.keys(payload)).toEqual(expectedKeys)
          for (const key of expectedKeys) {
            expect(Object.is(payload[key], source[key])).toBe(true)
          }
        }
      )
    )
  })

  it("skips function values", () => {
    const payload = collectPayloadFields({ fn: () => 1, keep: "x" }, () => false)

    expect(Object.keys(payload)).toEqual(["keep"])
  })

  it("keeps a __proto__ key as an own data property without changing the prototype", () => {
    const source = JSON.parse('{"__proto__": {"polluted": true}, "safe": 1}') as Record<
      string,
      unknown
    >

    const payload = collectPayloadFields(source, () => false)

    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype)
    expect(Object.hasOwn(payload, "__proto__")).toBe(true)
    expect(Object.getOwnPropertyDescriptor(payload, "__proto__")?.value).toEqual({
      polluted: true,
    })
    expect(Object.hasOwn({}, "polluted")).toBe(false)
  })
})
