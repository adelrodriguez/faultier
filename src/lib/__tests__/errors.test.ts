import { describe, expect, it } from "vitest"

import { RegistryMergeConflictError, RegistryTagMismatchError, ReservedFieldError } from "../errors"

describe("ReservedFieldError", () => {
  it("exposes its tag, name, field, and message", () => {
    const error = new ReservedFieldError({ field: "message" })

    expect(error._tag).toBe("ReservedFieldError")
    expect(error.name).toBe("ReservedFieldError")
    expect(error.field).toBe("message")
    expect(error.message).toBe("Reserved field key: message")
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
})

describe("RegistryMergeConflictError", () => {
  it("exposes its tag, name, field, and message", () => {
    const error = new RegistryMergeConflictError({ conflictingTag: "ConflictError" })

    expect(error._tag).toBe("RegistryMergeConflictError")
    expect(error.name).toBe("RegistryMergeConflictError")
    expect(error.conflictingTag).toBe("ConflictError")
    expect(error.message).toBe("Registry merge conflict for tag 'ConflictError'.")
  })
})
