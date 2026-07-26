import { describe, expect, it } from "bun:test"

import * as FaultierErrors from "../errors"
import * as Faultier from "../index"
import * as FaultierTypes from "../types"

describe("entrypoints", () => {
  it("exposes only the core runtime API from the root", () => {
    expect(Object.keys(Faultier).toSorted()).toEqual([
      "Fault",
      "Tagged",
      "fromSerializable",
      "isFault",
      "matchTag",
      "matchTags",
      "merge",
      "registry",
    ])
  })

  it("exposes only library errors from the errors entrypoint", () => {
    expect(Object.keys(FaultierErrors).toSorted()).toEqual([
      "RegistryMergeConflictError",
      "RegistryTagMismatchError",
      "ReservedFieldError",
    ])
  })

  it("has no runtime exports from the types entrypoint", () => {
    expect(Object.keys(FaultierTypes)).toEqual([])
  })
})
