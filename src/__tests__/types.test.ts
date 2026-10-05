import { describe, expect, it } from "vitest"

import * as FaultierTypes from "../types"

describe("types", () => {
  it("has no runtime exports from the types entrypoint", () => {
    expect(Object.keys(FaultierTypes)).toEqual([])
  })
})
