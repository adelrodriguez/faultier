import { describe, expect, it } from "vitest"

import * as FaultierErrors from "../errors"

describe("errors", () => {
  it("exposes only library errors", () => {
    expect(Object.keys(FaultierErrors).toSorted()).toEqual([
      "InvalidPayloadError",
      "RegistryMergeConflictError",
      "RegistryTagMismatchError",
      "ReservedFieldError",
    ])
  })
})
