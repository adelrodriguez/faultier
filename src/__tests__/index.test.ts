import { describe, expect, it } from "bun:test"
import { main } from "../index"

describe("main", () => {
  it("should return a placeholder string", () => {
    expect(main()).toBe("Let's bake some pastry! 🥐")
  })
})
