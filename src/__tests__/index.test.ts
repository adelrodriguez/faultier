import { describe, expect, it } from "vitest"

import * as Faultier from "../index"

describe("index", () => {
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
})
