import { describe, expect, it } from "bun:test"

import { matchTag, matchTags, Tagged } from "../index"

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

    const result = matchTag(
      error,
      "NotFoundError",
      (e) => e.id,
      () => "fallback"
    )

    expect(result).toBe("fallback")
  })
})

describe("matchTags", () => {
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

    const result = matchTags(
      error,
      {
        TimeoutError: () => "timeout",
      },
      () => "fallback"
    )

    expect(result).toBe("fallback")
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
