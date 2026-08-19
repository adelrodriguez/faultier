import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { Fault } from "../fault"
import { dispatchTag, dispatchTags } from "../match"

class ProbeFault extends Fault {
  // Static factory because Fault's constructor is protected; a bare public
  // constructor would be flagged as useless.
  static create(tag: string): ProbeFault {
    return new ProbeFault(tag)
  }

  private constructor(tag: string) {
    super(tag)
  }
}

const tagArb = fc.oneof(
  fc.string({ maxLength: 15 }),
  fc.constantFrom("toString", "constructor", "hasOwnProperty", "__proto__", "valueOf")
)

describe("dispatchTag", () => {
  it("invokes exactly one of handler and fallback based on tag equality", () => {
    fc.assert(
      fc.property(tagArb, tagArb, fc.boolean(), fc.boolean(), (tag, other, same, withFallback) => {
        const matchTag = same ? tag : other
        const fault = ProbeFault.create(tag)
        const calls: string[] = []
        const handler = (matched: never) => {
          calls.push("handler")
          expect(matched).toBe(fault as never)
          return "handled"
        }
        const fallback = withFallback
          ? () => {
              calls.push("fallback")
              return "fell-back"
            }
          : undefined

        const result = dispatchTag(fault, matchTag, handler, fallback)

        if (tag === matchTag) {
          expect(calls).toEqual(["handler"])
          expect(result).toBe("handled")
        } else if (withFallback) {
          expect(calls).toEqual(["fallback"])
          expect(result).toBe("fell-back")
        } else {
          expect(calls).toEqual([])
          expect(result).toBeUndefined()
        }
      })
    )
  })
})

describe("dispatchTags", () => {
  it("invokes only an own handler for the fault's tag, else the fallback", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(tagArb, { maxLength: 5 }),
        tagArb,
        fc.boolean(),
        (handlerTags, faultTag, withFallback) => {
          const fault = ProbeFault.create(faultTag)
          const calls: string[] = []
          const handlers: Record<string, (matched: never) => unknown> = {}

          for (const tag of handlerTags) {
            Object.defineProperty(handlers, tag, {
              configurable: true,
              enumerable: true,
              value: (matched: never) => {
                calls.push(`handler:${tag}`)
                expect(matched).toBe(fault as never)
                return `handled:${tag}`
              },
              writable: true,
            })
          }

          const fallback = withFallback
            ? () => {
                calls.push("fallback")
                return "fell-back"
              }
            : undefined

          const result = dispatchTags(fault, handlers, fallback)

          if (handlerTags.includes(faultTag)) {
            expect(calls).toEqual([`handler:${faultTag}`])
            expect(result).toBe(`handled:${faultTag}`)
          } else if (withFallback) {
            // Inherited prototype members (toString, hasOwnProperty, ...) must
            // never be picked up as handlers — only own keys count.
            expect(calls).toEqual(["fallback"])
            expect(result).toBe("fell-back")
          } else {
            expect(calls).toEqual([])
            expect(result).toBeUndefined()
          }
        }
      )
    )
  })
})
