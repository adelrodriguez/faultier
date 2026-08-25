import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { Fault } from "../fault"
import { dispatchTag, dispatchTags, matchTag, matchTags } from "../match"
import { Tagged } from "../tagged"

class NotFoundError extends Tagged("NotFoundError")<{ id: string }>() {}
class TimeoutError extends Tagged("TimeoutError")() {}
class PaymentError extends Tagged("PaymentError")<{ invoiceId: string }>() {}

type AppError = NotFoundError | TimeoutError | PaymentError
type CoreError = NotFoundError | TimeoutError

function asAppError(error: AppError): AppError {
  return error
}

function asCoreError(error: CoreError): CoreError {
  return error
}

describe("matchTag", () => {
  it("calls handler when tag matches", () => {
    const error = new NotFoundError({ id: "123" })

    const result = matchTag(error, "NotFoundError", (e) => e.id)

    expect(result).toBe("123")
  })

  it("returns undefined when tag does not match without fallback", () => {
    const error = asAppError(new TimeoutError())

    const result = matchTag(error, "NotFoundError", (e) => e.id)

    expect(result).toBeUndefined()
  })

  it("calls fallback when tag does not match", () => {
    const error = asAppError(new TimeoutError())
    let fallbackInput: AppError | undefined

    const result = matchTag(
      error,
      "NotFoundError",
      (e) => e.id,
      (fallbackError) => {
        fallbackInput = fallbackError
        return "fallback"
      }
    )

    expect(result).toBe("fallback")
    expect(fallbackInput).toBe(error)
  })
})

describe("matchTags", () => {
  it("calls fallback when an omitted tag matches an inherited property", () => {
    class ToStringError extends Tagged("toString")() {}
    const error = new ToStringError()

    const result = matchTags(error, {}, () => "fallback")

    expect(result).toBe("fallback")
  })

  it("dispatches an own handler whose tag matches an inherited property", () => {
    class ToStringError extends Tagged("toString")() {}
    const error = new ToStringError()

    const result = matchTags(error, {
      toString: () => "matched",
    })

    expect(result).toBe("matched")
  })

  it("dispatches to matching handler", () => {
    const error = new TimeoutError()

    const result = matchTags(error, {
      TimeoutError: () => "timeout",
    })

    expect(result).toBe("timeout")
  })

  it("returns undefined when no handler matches without fallback", () => {
    const error = asAppError(new PaymentError({ invoiceId: "inv_1" }))

    const result = matchTags(error, {
      TimeoutError: () => "timeout",
    })

    expect(result).toBeUndefined()
  })

  it("calls fallback when no handler matches", () => {
    const error = asAppError(new PaymentError({ invoiceId: "inv_1" }))
    let fallbackInput: AppError | undefined

    const result = matchTags(
      error,
      {
        TimeoutError: () => "timeout",
      },
      (fallbackError) => {
        fallbackInput = fallbackError
        return "fallback"
      }
    )

    expect(result).toBe("fallback")
    expect(fallbackInput).toBe(error)
  })

  it("matches a union of three members", () => {
    const error = asAppError(new NotFoundError({ id: "abc" }))

    const result = matchTags(error, {
      NotFoundError: (e) => e.id,
      PaymentError: (e) => e.invoiceId,
      TimeoutError: () => "timeout",
    })

    expect(result).toBe("abc")
  })

  it("matches a union of two members", () => {
    const error = asCoreError(new TimeoutError())

    const result = matchTags(error, {
      NotFoundError: (e) => e.id,
      TimeoutError: () => "timeout",
    })

    expect(result).toBe("timeout")
  })
})

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
        const matchingTag = same ? tag : other
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

        const result = dispatchTag(fault, matchingTag, handler, fallback)

        if (tag === matchingTag) {
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
