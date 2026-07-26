import { describe, expect, it } from "bun:test"

import { ReservedFieldError } from "../errors"
import { Fault, Tagged } from "../index"

describe("Tagged", () => {
  it("creates class with matching _tag and name", () => {
    class NotFoundError extends Tagged("NotFoundError")<{ resource: string }>() {}

    const fault = new NotFoundError({ resource: "user" })

    expect(fault).toBeInstanceOf(Fault)
    expect(fault._tag).toBe("NotFoundError")
    expect(fault.name).toBe("NotFoundError")
  })

  it("assigns constructor fields to instance", () => {
    class NotFoundError extends Tagged("NotFoundError")<{ id: string; resource: string }>() {}

    const fault = new NotFoundError({ id: "123", resource: "user" })

    expect(fault.id).toBe("123")
    expect(fault.resource).toBe("user")
  })

  it("throws ReservedFieldError for reserved field keys", () => {
    class InvalidFieldError extends Tagged("InvalidFieldError")<{ message: string }>() {}

    expect(() => new InvalidFieldError({ message: "nope" })).toThrow(ReservedFieldError)
    expect(() => new InvalidFieldError({ message: "nope" })).toThrow("Reserved field key: message")
  })

  it("accepts no constructor arguments for empty fields", () => {
    class TimeoutError extends Tagged("TimeoutError")() {}

    const fault = new TimeoutError()

    expect(fault._tag).toBe("TimeoutError")
  })
})
