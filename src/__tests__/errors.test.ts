import { describe, expect, it } from "bun:test"

import { RegistryMergeConflictError, RegistryTagMismatchError, ReservedFieldError } from "../errors"
import { merge, registry, Tagged } from "../index"

describe("ReservedFieldError", () => {
  it("exposes its tag, name, field, and message", () => {
    const error = new ReservedFieldError({ field: "message" })

    expect(error._tag).toBe("ReservedFieldError")
    expect(error.name).toBe("ReservedFieldError")
    expect(error.field).toBe("message")
    expect(error.message).toBe("Reserved field key: message")
  })

  it("retains constructor identity when thrown through Tagged", () => {
    class InvalidFieldError extends Tagged("InvalidFieldError")<{ message: string }>() {}

    expect(() => new InvalidFieldError({ message: "reserved" })).toThrow(ReservedFieldError)
  })
})

describe("RegistryTagMismatchError", () => {
  it("exposes its tag, name, fields, and message", () => {
    const error = new RegistryTagMismatchError({
      ctorTag: "ActualError",
      registryKey: "ExpectedError",
    })

    expect(error._tag).toBe("RegistryTagMismatchError")
    expect(error.name).toBe("RegistryTagMismatchError")
    expect(error.ctorTag).toBe("ActualError")
    expect(error.registryKey).toBe("ExpectedError")
    expect(error.message).toBe(
      "Registry key 'ExpectedError' does not match constructor tag 'ActualError'."
    )
  })

  it("retains constructor identity when thrown through registry", () => {
    class ActualError extends Tagged("ActualError")() {}

    expect(() => registry({ ExpectedError: ActualError })).toThrow(RegistryTagMismatchError)
  })
})

describe("RegistryMergeConflictError", () => {
  it("exposes its tag, name, field, and message", () => {
    const error = new RegistryMergeConflictError({ conflictingTag: "ConflictError" })

    expect(error._tag).toBe("RegistryMergeConflictError")
    expect(error.name).toBe("RegistryMergeConflictError")
    expect(error.conflictingTag).toBe("ConflictError")
    expect(error.message).toBe("Registry merge conflict for tag 'ConflictError'.")
  })

  it("retains constructor identity when thrown through merge", () => {
    class FirstConflictError extends Tagged("ConflictError")() {}
    class SecondConflictError extends Tagged("ConflictError")() {}
    const FirstFault = registry({ ConflictError: FirstConflictError })
    const SecondFault = registry({ ConflictError: SecondConflictError })

    expect(() => merge(FirstFault, SecondFault)).toThrow(RegistryMergeConflictError)
  })
})
