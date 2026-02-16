import { describe, expect, test } from "bun:test"

import { matchTag, matchTags } from "../match"
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
  test("should hit handler when tag matches", () => {
    const error = new NotFoundError({ id: "123" })

    const result = matchTag(error, "NotFoundError", (e) => e.id)

    expect(result).toBe("123")
  })

  test("should return undefined when tag does not match without fallback", () => {
    const error = asAppError(new TimeoutError())

    const result = matchTag(error, "NotFoundError", (e) => e.id)

    expect(result).toBeUndefined()
  })

  test("should call fallback when tag does not match", () => {
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
  test("should dispatch to matching handler", () => {
    const error = new TimeoutError()

    const result = matchTags(error, {
      TimeoutError: () => "timeout",
    })

    expect(result).toBe("timeout")
  })

  test("should return undefined when no handler matches without fallback", () => {
    const error = asAppError(new PaymentError({ invoiceId: "inv_1" }))

    const result = matchTags(error, {
      TimeoutError: () => "timeout",
    })

    expect(result).toBeUndefined()
  })

  test("should call fallback when no handler matches", () => {
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

  test("should work with union of three members", () => {
    const error = asAppError(new NotFoundError({ id: "abc" }))

    const result = matchTags(error, {
      NotFoundError: (e) => e.id,
      PaymentError: (e) => e.invoiceId,
      TimeoutError: () => "timeout",
    })

    expect(result).toBe("abc")
  })

  test("should work with union of two members", () => {
    const error = asCoreError(new TimeoutError())

    const result = matchTags(error, {
      NotFoundError: (e) => e.id,
      TimeoutError: () => "timeout",
    })

    expect(result).toBe("timeout")
  })
})
