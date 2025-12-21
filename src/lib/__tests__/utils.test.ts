import { describe, expect, it } from "bun:test"
import { HAS_PUNCTUATION } from "../utils"

describe("utils", () => {
  describe("HAS_PUNCTUATION", () => {
    it("should match a period at the end", () => {
      expect(HAS_PUNCTUATION.test("Hello.")).toBe(true)
    })

    it("should match an exclamation mark at the end", () => {
      expect(HAS_PUNCTUATION.test("Wow!")).toBe(true)
    })

    it("should match a question mark at the end", () => {
      expect(HAS_PUNCTUATION.test("Really?")).toBe(true)
    })

    it("should not match if there is no punctuation at the end", () => {
      expect(HAS_PUNCTUATION.test("No punctuation")).toBe(false)
    })

    it("should not match punctuation in the middle of the string", () => {
      expect(HAS_PUNCTUATION.test("This is fine. But what about this")).toBe(false)
    })

    it("should match only if punctuation is last, even with whitespace", () => {
      expect(HAS_PUNCTUATION.test("Ends here! ")).toBe(false)
      expect(HAS_PUNCTUATION.test("Ends here!")).toBe(true)
    })

    it("should not match empty string", () => {
      expect(HAS_PUNCTUATION.test("")).toBe(false)
    })
  })
})
