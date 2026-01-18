import { describe, expect, it } from "bun:test"
import type { SerializableFault } from "#lib/types.ts"
import Faultier, { IS_FAULT, NO_FAULT_TAG, UNKNOWN } from "#lib/index.ts"

// Define test registry
type TestRegistry = {
  MY_TAG: {
    requestId?: string
    errorCode?: number
    userId?: string
    sessionId?: string
    timestamp?: number
  }
  LAYER_1: {
    host?: string
    port?: number
    database?: string
    timeout?: number
    retries?: number
  }
  LAYER_2: {
    service?: string
    method?: string
    statusCode?: number
    timeout?: number
  }
  LAYER_3: {
    endpoint?: string
    method?: string
    statusCode?: number
    headers?: Record<string, string>
  }
  LAYER_4: {
    path: string
  }
  NO_CONTEXT_TAG: never // Tag that doesn't accept context
}

// Create test Fault class
class Fault extends Faultier.define<TestRegistry>() {
  custom(): 123 {
    void this
    return 123
  }

  isRetryable(): boolean {
    return this.tag === "LAYER_1"
  }
}

describe("Fault", () => {
  describe("toJSON", () => {
    it("should serialize using toSerializable output", () => {
      const err = new Error("Something happened")
      const fault = Fault.wrap(err)
        .withTag("MY_TAG", { errorCode: 100, requestId: "123" })
        .withDescription("Something went really wrong")
        .withMeta({ retryable: true, traceId: "trace-123" })

      // oxlint-disable-next-line unicorn/prefer-structured-clone -- Need JSON.stringify to trigger toJSON()
      const json = JSON.parse(JSON.stringify(fault))
      // oxlint-disable-next-line unicorn/prefer-structured-clone -- Normalize JSON output for comparison
      const expected = JSON.parse(JSON.stringify(Fault.toSerializable(fault)))

      expect(json).toEqual(expected)
    })

    it("should serialize nested fault causes", () => {
      const rootError = new Error("Database connection failed")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("DB timeout", "Failed to connect to database")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Service failed", "Authentication service unavailable")

      // oxlint-disable-next-line unicorn/prefer-structured-clone -- Need JSON.stringify to trigger toJSON()
      const json = JSON.parse(JSON.stringify(fault2))
      // oxlint-disable-next-line unicorn/prefer-structured-clone -- Normalize JSON output for comparison
      const expected = JSON.parse(JSON.stringify(Fault.toSerializable(fault2)))

      expect(json).toEqual(expected)
    })
  })

  describe("modifiers", () => {
    it("should apply the modifiers to the fault", () => {
      const fault = Fault.wrap(new Error("something happened"))
        .withTag("MY_TAG", { errorCode: 100, requestId: "123" })
        .withDescription("Something went really wrong")

      expect(fault.name).toBe("Fault[MY_TAG]")
      expect(fault.tag).toBe("MY_TAG")
      expect(fault.message).toBe("something happened")
      expect(fault.details).toBe("Something went really wrong")
      expect(fault.context).toEqual({ errorCode: 100, requestId: "123" })
    })

    describe("withTag", () => {
      it("should set the tag and context", () => {
        const fault = Fault.wrap(new Error("something happened")).withTag("MY_TAG", {
          requestId: "123",
        })
        expect(fault.tag).toBe("MY_TAG")
        expect(fault.context).toEqual({ requestId: "123" })
        expect(fault instanceof Fault).toBe(true)
      })

      it("should allow omitting context when all properties are optional", () => {
        const fault = Fault.wrap(new Error("test")).withTag("LAYER_1")
        expect(fault.tag).toBe("LAYER_1")
        expect(fault.context).toBeUndefined()
      })

      it("should require context when registry has required properties", () => {
        // LAYER_4 has required `path` property
        const fault = Fault.wrap(new Error("test")).withTag("LAYER_4", { path: "/test" })
        expect(fault.tag).toBe("LAYER_4")
        expect(fault.context).toEqual({ path: "/test" })
      })
    })

    describe("withDescription", () => {
      it("should preserve the original message", () => {
        const fault = Fault.wrap(new Error("something happened")).withDescription(
          "Something went really wrong"
        )

        expect(fault.details).toBe("Something went really wrong")
        expect(fault.message).toBe("something happened")
      })

      it("should override the message of the fault, if provided", () => {
        const error = new Error("This is my original message")

        const fault = Fault.wrap(error).withDescription(
          "Something went really wrong",
          "This is my custom message"
        )

        expect(fault.message).toBe("This is my custom message")
      })
    })

    describe("withDetails", () => {
      it("should set only the details message, preserving the original message", () => {
        const fault = Fault.wrap(new Error("something happened")).withDetails(
          "Something went really wrong"
        )

        expect(fault.details).toBe("Something went really wrong")
        expect(fault.message).toBe("something happened")
      })

      it("should allow chaining", () => {
        const fault = Fault.wrap(new Error("test"))
          .withTag("MY_TAG", { requestId: "123" })
          .withDetails("Debug message")

        expect(fault.details).toBe("Debug message")
        expect(fault.tag).toBe("MY_TAG")
        expect(fault.context).toEqual({ requestId: "123" })
      })
    })

    describe("withMessage", () => {
      it("should set only the message, not affecting details", () => {
        const fault = Fault.wrap(new Error("original message"))
          .withDescription("Debug info")
          .withMessage("User-facing message")

        expect(fault.message).toBe("User-facing message")
        expect(fault.details).toBe("Debug info")
      })

      it("should override message without setting details", () => {
        const fault = Fault.wrap(new Error("original message")).withMessage("New message")

        expect(fault.message).toBe("New message")
        expect(fault.details).toBeUndefined()
      })

      it("should allow chaining", () => {
        const fault = Fault.wrap(new Error("test"))
          .withTag("MY_TAG", { requestId: "123" })
          .withMessage("User message")

        expect(fault.message).toBe("User message")
        expect(fault.tag).toBe("MY_TAG")
        expect(fault.context).toEqual({ requestId: "123" })
      })
    })

    describe("withMeta", () => {
      it("should merge meta across calls", () => {
        const fault = Fault.wrap(new Error("test"))
          .withMeta({ requestId: "123", retryable: true })
          .withMeta({ retryable: false, traceId: "trace-1" })

        expect(fault.meta).toEqual({ requestId: "123", retryable: false, traceId: "trace-1" })
      })

      it("should allow chaining", () => {
        const fault = Fault.wrap(new Error("test"))
          .withTag("MY_TAG", { requestId: "123", timestamp: 1 })
          .withMeta({ source: "api" })
          .withDetails("Debug message")

        expect(fault.meta).toEqual({ source: "api" })
        expect(fault.tag).toBe("MY_TAG")
      })
    })

    describe("context", () => {
      it("should default to undefined", () => {
        const fault = Fault.wrap(new Error("test"))

        expect(fault.context).toBeUndefined()
      })

      it("should set context via withTag", () => {
        const fault = Fault.create("MY_TAG", { errorCode: 100, requestId: "123" })
        expect(fault.context).toEqual({ errorCode: 100, requestId: "123" })
      })

      it("should set context via create", () => {
        const fault = Fault.create("LAYER_4", { path: "/test/path" })
        expect(fault.context).toEqual({ path: "/test/path" })
      })
    })
  })

  describe("isFault", () => {
    it("should return true if the value is a fault", () => {
      const err = new Error("Something happened")

      const fault = Fault.wrap(err).withTag("MY_TAG").withDescription("Something went really wrong")

      expect(Fault.isFault(new Date())).toBe(false)
      expect(Fault.isFault(null)).toBe(false)
      expect(Fault.isFault("not an error")).toBe(false)
      expect(Fault.isFault(123)).toBe(false)
      expect(Fault.isFault(true)).toBe(false)
      expect(Fault.isFault(fault)).toBe(true)
      expect(Fault.isFault(new Error("Something went wrong"))).toBe(false)
    })

    it("should narrow type through registry", () => {
      const fault = Fault.wrap(new Error("test")).withTag("LAYER_1")

      if (Fault.isFault(fault)) {
        expect(fault.tag).toBe("LAYER_1")
      }
    })

    it("should return true for plain object with IS_FAULT symbol", () => {
      const fakeFault = {
        [IS_FAULT]: true,
        context: {},
        tag: "MY_TAG",
      }

      expect(Fault.isFault(fakeFault)).toBe(true)
    })

    it("should return false if IS_FAULT symbol is present but not true", () => {
      const fakeFault = {
        [IS_FAULT]: false,
        context: {},
        tag: "MY_TAG",
      }

      expect(Fault.isFault(fakeFault)).toBe(false)
    })
  })

  describe("isUnknown", () => {
    it("should return true for UNKNOWN symbol", () => {
      const result = Fault.handle(new Error("test"), {
        LAYER_1: () => "handled",
        LAYER_2: () => "handled",
        LAYER_3: () => "handled",
        LAYER_4: () => "handled",
        MY_TAG: () => "handled",
        NO_CONTEXT_TAG: () => "handled",
      })

      expect(Fault.isUnknown(result)).toBe(true)
    })

    it("should return false for handler results", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG")

      const result = Fault.matchTag(fault, "MY_TAG", () => "matched")

      expect(Fault.isUnknown(result)).toBe(false)
      expect(result).toBe("matched")
    })

    it("should return false for other values", () => {
      expect(Fault.isUnknown("string")).toBe(false)
      expect(Fault.isUnknown(123)).toBe(false)
      expect(Fault.isUnknown(null)).toBe(false)
      expect(Fault.isUnknown({})).toBe(false)
      expect(Fault.isUnknown([])).toBe(false)
      expect(Fault.isUnknown(true)).toBe(false)
    })

    it("should work with matchTags result", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG")

      const matched = Fault.matchTags(fault, {
        MY_TAG: () => ({ status: 404 }),
      })
      const unmatched = Fault.matchTags(fault, {
        LAYER_1: () => ({ status: 500 }),
      })

      expect(Fault.isUnknown(matched)).toBe(false)
      expect(Fault.isUnknown(unmatched)).toBe(true)
    })
  })

  describe("assert", () => {
    it("should not throw when given a Fault instance", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG")

      expect(() => {
        Fault.assert(fault)
      }).not.toThrow()
    })

    it("should throw the original error when given a non-fault", () => {
      const plainError = new Error("Not a fault")

      expect(() => {
        Fault.assert(plainError)
      }).toThrow(plainError)
    })

    it("should throw non-Error values", () => {
      expect(() => {
        Fault.assert("not an error")
      }).toThrow("not an error")
      expect(() => {
        try {
          Fault.assert(null)
        } catch (error) {
          expect(error).toBe(null)
          throw error
        }
      }).toThrow()
    })
  })

  describe("handle", () => {
    it("should return handler result when error is a Fault with matching handler", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG")

      const result = Fault.handle(fault, {
        LAYER_1: () => "not handled",
        LAYER_2: () => "not handled",
        LAYER_3: () => "not handled",
        LAYER_4: () => "not handled",
        MY_TAG: () => "handled",
        NO_CONTEXT_TAG: () => "not handled",
      })

      expect(result).toBe("handled")
    })

    it("should return UNKNOWN when error is not a fault", () => {
      const plainError = new Error("Not a fault")

      const result = Fault.handle(plainError, {
        LAYER_1: () => "handled",
        LAYER_2: () => "handled",
        LAYER_3: () => "handled",
        LAYER_4: () => "handled",
        MY_TAG: () => "handled",
        NO_CONTEXT_TAG: () => "handled",
      })

      expect(result).toBe(UNKNOWN)
    })

    it("should return UNKNOWN when error is a Fault but no handler exists for tag", () => {
      const fault = Fault.wrap(new Error("test"))

      const result = Fault.handle(fault, {
        LAYER_1: () => "handled",
        LAYER_2: () => "handled",
        LAYER_3: () => "handled",
        LAYER_4: () => "handled",
        MY_TAG: () => "handled",
        NO_CONTEXT_TAG: () => "handled",
      })

      expect(result).toBe(UNKNOWN)
    })

    it("should only invoke the matching handler", () => {
      const fault = Fault.wrap(new Error("test")).withTag("LAYER_1")

      const result = Fault.handle(fault, {
        LAYER_1: () => "handler2",
        LAYER_2: () => "handler3",
        LAYER_3: () => "handler4",
        LAYER_4: () => "not used",
        MY_TAG: () => "handler1",
        NO_CONTEXT_TAG: () => "handler5",
      })

      expect(result).toBe("handler2")
    })
  })

  describe("matchTag", () => {
    it("should return callback result when tag matches", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG")

      const result = Fault.matchTag(fault, "MY_TAG", (f) => {
        expect(f.tag).toBe("MY_TAG")
        return "matched"
      })

      expect(result).toBe("matched")
    })

    it("should return UNKNOWN when tag doesn't match", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG")

      const result = Fault.matchTag(fault, "LAYER_1", () => "should not run")

      expect(result).toBe(UNKNOWN)
    })

    it("should return UNKNOWN when error is not a fault", () => {
      const plainError = new Error("Not a fault")

      const result = Fault.matchTag(plainError, "MY_TAG", () => "should not run")

      expect(result).toBe(UNKNOWN)
    })

    it("should provide correctly typed fault in callback", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG", {
        errorCode: 100,
        requestId: "123",
      })

      const result = Fault.matchTag(fault, "MY_TAG", (f) => {
        expect(f.context?.requestId).toBe("123")
        expect(f.context?.errorCode).toBe(100)
        return f.context?.requestId
      })

      expect(result).toBe("123")
    })

    it("should work with faults created via Fault.create", () => {
      const fault = Fault.create("MY_TAG", { requestId: "123" })

      const result = Fault.matchTag(fault, "MY_TAG", (f) => f.context?.requestId)

      expect(result).toBe("123")
    })

    it("should work with faults created via Fault.wrap", () => {
      const fault = Fault.wrap(new Error("original")).withTag("LAYER_1", { host: "localhost" })

      const result = Fault.matchTag(fault, "LAYER_1", (f) => f.context?.host)

      expect(result).toBe("localhost")
    })
  })

  describe("matchTags", () => {
    it("should return handler result when tag matches", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG")

      const result = Fault.matchTags(fault, {
        MY_TAG: (f) => {
          expect(f.tag).toBe("MY_TAG")
          return { status: 404 }
        },
      })

      expect(result).toEqual({ status: 404 })
    })

    it("should return UNKNOWN when no handler matches", () => {
      const fault = Fault.wrap(new Error("test")).withTag("LAYER_1")

      const result = Fault.matchTags(fault, {
        MY_TAG: (_f) => ({ status: 404 }),
      })

      expect(result).toBe(UNKNOWN)
    })

    it("should return UNKNOWN when error is not a fault", () => {
      const plainError = new Error("Not a fault")

      const result = Fault.matchTags(plainError, {
        MY_TAG: (_f) => ({ status: 404 }),
      })

      expect(result).toBe(UNKNOWN)
    })

    it("should only require specified tags (partial matching)", () => {
      const fault1 = Fault.wrap(new Error("test")).withTag("MY_TAG")
      const fault2 = Fault.wrap(new Error("test")).withTag("LAYER_1")

      const handler = (error: unknown) =>
        Fault.matchTags(error, {
          LAYER_1: (f) => {
            expect(f.tag).toBe("LAYER_1")
            return { status: 500 }
          },
          MY_TAG: (f) => {
            expect(f.tag).toBe("MY_TAG")
            return { status: 404 }
          },
        })

      const result1 = handler(fault1)
      const result2 = handler(fault2)

      expect(result1).toEqual({ status: 404 })
      expect(result2).toEqual({ status: 500 })
    })

    it("should provide type-safe handler arguments with context", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG", {
        errorCode: 100,
        requestId: "123",
      })

      const result = Fault.matchTags(fault, {
        MY_TAG: (f) => {
          expect(f.context?.requestId).toBe("123")
          expect(f.context?.errorCode).toBe(100)
          return f.context?.requestId
        },
      })

      expect(result).toBe("123")
    })

    it("should return union of handler return types", () => {
      const fault1 = Fault.wrap(new Error("test")).withTag("MY_TAG")
      const fault2 = Fault.wrap(new Error("test")).withTag("LAYER_1")

      const handler = (error: unknown) =>
        Fault.matchTags(error, {
          LAYER_1: () => 42,
          MY_TAG: () => "string result",
        })

      const result1 = handler(fault1)
      const result2 = handler(fault2)

      expect(result1).toBe("string result")
      expect(result2).toBe(42)
    })

    it("should handle multiple tags", () => {
      const faults = [
        Fault.wrap(new Error("test")).withTag("MY_TAG"),
        Fault.wrap(new Error("test")).withTag("LAYER_1"),
        Fault.wrap(new Error("test")).withTag("LAYER_2"),
        Fault.wrap(new Error("test")).withTag("LAYER_3"),
      ]

      const handler = (error: unknown) =>
        Fault.matchTags(error, {
          LAYER_1: () => 2,
          LAYER_2: () => 3,
          LAYER_3: () => 4,
          MY_TAG: () => 1,
        })

      const results = faults.map((f) => handler(f))

      expect(results).toEqual([1, 2, 3, 4])
    })
  })

  describe("unwrap", () => {
    it("should return the full fault chain from a wrapped fault", () => {
      const originalError = new Error("Original error")
      const fault = Fault.wrap(originalError).withTag("LAYER_1")

      const chain = fault.unwrap()

      expect(chain).toHaveLength(2)
      expect(chain[0]).toBe(fault)
      expect(chain[1]).toBe(originalError)
      expect(chain[1]?.message).toBe("Original error")
    })

    it("should traverse multi-level fault chains", () => {
      const dbError = new Error("Database timeout")
      const fault1 = Fault.wrap(dbError).withTag("LAYER_1", { host: "localhost", port: 5432 })
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2", { service: "auth" })
      const fault3 = Fault.wrap(fault2).withTag("LAYER_3", { endpoint: "/login" })

      const chain = fault3.unwrap()
      expect(chain).toHaveLength(4)
      expect(chain[0]).toBe(fault3)
      expect(chain[1]).toBe(fault2)
      expect(chain[2]).toBe(fault1)
      expect(chain[3]).toBe(dbError)

      const filtered = chain.filter((e) => Fault.isFault(e))

      expect(filtered).toHaveLength(3)
      expect(filtered[0]?.tag).toBe("LAYER_3")
      expect(filtered[1]?.tag).toBe("LAYER_2")
      expect(filtered[2]?.tag).toBe("LAYER_1")
    })

    it("should collect all tags through chain", () => {
      const dbError = new Error("Database timeout")
      const fault1 = Fault.wrap(dbError).withTag("LAYER_1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")
      const fault3 = Fault.wrap(fault2).withTag("LAYER_3")

      const chain = fault3.unwrap()
      const tags = chain.filter((e) => Fault.isFault(e)).map((f) => f.tag)

      expect(tags).toEqual(["LAYER_3", "LAYER_2", "LAYER_1"])
    })

    it("should merge contexts from all faults in chain", () => {
      const dbError = new Error("Database timeout")
      const fault1 = Fault.wrap(dbError).withTag("LAYER_1", { host: "localhost", port: 5432 })
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2", { service: "auth" })
      const fault3 = Fault.wrap(fault2).withTag("LAYER_3", { endpoint: "/login" })

      const chain = fault3.unwrap()
      const faults = chain.filter((e) => Fault.isFault(e))
      const mergedContext: Record<string, unknown> = {}
      for (const fault of faults) {
        for (const [key, value] of Object.entries(fault.context ?? {})) {
          mergedContext[key] = value
        }
      }

      expect(mergedContext).toEqual({
        endpoint: "/login",
        host: "localhost",
        port: 5432,
        service: "auth",
      })
    })

    it("should get root cause from chain", () => {
      const rootError = new Error("Root cause")
      const fault1 = Fault.wrap(rootError).withTag("LAYER_1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")
      const fault3 = Fault.wrap(fault2).withTag("LAYER_3")

      const chain = fault3.unwrap()
      const root = chain.at(-1)

      expect(root).toBe(rootError)
      expect(root?.message).toBe("Root cause")
    })
  })

  describe("getFullContext", () => {
    it("should merge context from all faults in chain", () => {
      const dbError = new Error("Database timeout")
      const fault1 = Fault.wrap(dbError).withTag("LAYER_1", { host: "localhost", port: 5432 })
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2", { service: "auth" })
      const fault3 = Fault.wrap(fault2).withTag("LAYER_3", { endpoint: "/login" })

      const fullContext = fault3.getFullContext()

      expect(fullContext).toEqual({
        endpoint: "/login",
        host: "localhost",
        port: 5432,
        service: "auth",
      })
    })

    it("should override duplicate keys from root to current", () => {
      const fault1 = Fault.wrap(new Error("test")).withTag("MY_TAG", {
        errorCode: 100,
        requestId: "abc",
        userId: "user123",
      })
      const fault2 = Fault.wrap(fault1).withTag("MY_TAG", {
        errorCode: 200,
        requestId: "def",
        sessionId: "session456",
      })

      const fullContext = fault2.getFullContext()

      expect(fullContext).toEqual({
        errorCode: 200,
        requestId: "def",
        sessionId: "session456",
        userId: "user123",
      })
    })

    it("should work with single fault", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG", {
        requestId: "value",
      })

      expect(fault.getFullContext()).toEqual({ requestId: "value" })
    })

    it("should work with registry-typed faults", () => {
      const fault1 = Fault.wrap(new Error("test")).withTag("MY_TAG", {
        errorCode: 100,
      })
      const fault2 = Fault.wrap(fault1).withTag("MY_TAG", {
        errorCode: 200,
      })

      expect(fault2.getFullContext()).toEqual({
        errorCode: 200,
      })
    })

    it("should handle empty contexts", () => {
      const fault1 = Fault.wrap(new Error("test"))
      const fault2 = Fault.wrap(fault1).withTag("MY_TAG", { requestId: "value" })

      expect(fault2.getFullContext()).toEqual({ requestId: "value" })
    })
  })

  describe("getFullMeta", () => {
    it("should merge meta from all faults in chain", () => {
      const dbError = new Error("Database timeout")
      const fault1 = Fault.wrap(dbError).withTag("LAYER_1").withMeta({ host: "localhost" })
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2").withMeta({ service: "auth" })
      const fault3 = Fault.wrap(fault2).withTag("LAYER_3").withMeta({ endpoint: "/login" })

      expect(fault3.getFullMeta()).toEqual({
        endpoint: "/login",
        host: "localhost",
        service: "auth",
      })
    })

    it("should override duplicate keys from root to current", () => {
      const fault1 = Fault.wrap(new Error("test")).withTag("MY_TAG").withMeta({
        requestId: "abc",
        retryable: true,
      })
      const fault2 = Fault.wrap(fault1).withTag("MY_TAG").withMeta({
        requestId: "def",
        traceId: "trace-1",
      })

      expect(fault2.getFullMeta()).toEqual({
        requestId: "def",
        retryable: true,
        traceId: "trace-1",
      })
    })

    it("should work with single fault", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG").withMeta({ requestId: "value" })

      expect(fault.getFullMeta()).toEqual({ requestId: "value" })
    })

    it("should handle empty meta", () => {
      const fault1 = Fault.wrap(new Error("test"))
      const fault2 = Fault.wrap(fault1).withTag("MY_TAG").withMeta({ requestId: "value" })

      expect(fault2.getFullMeta()).toEqual({ requestId: "value" })
    })
  })

  describe("getTags", () => {
    it("should get all tags from fault chain", () => {
      const rootError = new Error("Database error")
      const fault1 = Fault.wrap(rootError).withTag("LAYER_1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")
      const fault3 = Fault.wrap(fault2).withTag("LAYER_3")

      const tags = fault3.getTags()

      expect(tags).toEqual(["LAYER_3", "LAYER_2", "LAYER_1"])
    })

    it("should work with single fault", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG")

      expect(fault.getTags()).toEqual(["MY_TAG"])
    })

    it("should work with registry-typed faults", () => {
      const rootError = new Error("Invalid token")
      const fault1 = Fault.wrap(rootError).withTag("LAYER_1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")

      expect(fault2.getTags()).toEqual(["LAYER_2", "LAYER_1"])
    })

    it("should only include fault tags, not raw errors", () => {
      const rawError = new Error("Raw error")
      const fault = Fault.wrap(rawError).withTag("LAYER_1")

      expect(fault.getTags()).toEqual(["LAYER_1"])
    })

    it("should include 'No fault tag set' when no tag is set", () => {
      const fault = Fault.wrap(new Error("test"))

      const tags = fault.getTags()

      expect(tags).toEqual([NO_FAULT_TAG])
      expect(fault.tag).toBe(NO_FAULT_TAG)
    })
  })

  describe("flatten", () => {
    it("should flatten messages from fault chain", () => {
      const rootError = new Error("Database connection failed")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("DB timeout", "Failed to connect to database")

      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Service failed", "Authentication service unavailable")

      const fault3 = Fault.wrap(fault2)
        .withTag("LAYER_3")
        .withDescription("API failed", "User login failed")

      const flattened = fault3.flatten()

      expect(flattened).toBe(
        "User login failed -> Authentication service unavailable -> Failed to connect to database -> Database connection failed"
      )
    })

    it("should use custom separator", () => {
      const rootError = new Error("Root error")
      const fault1 = Fault.wrap(rootError).withDescription("Layer 1", "Error 1")
      const fault2 = Fault.wrap(fault1).withDescription("Layer 2", "Error 2")

      const flattened = fault2.flatten({ separator: " | " })

      expect(flattened).toBe("Error 2 | Error 1 | Root error")
    })

    it("should deduplicate consecutive messages", () => {
      const fault = Fault.wrap(new Error("Original error"))

      expect(fault.flatten()).toBe("Original error")
    })

    it("should work with registry fault without cause", () => {
      const myError = Fault.wrap(new Error("Original"))
        .withTag("LAYER_3")
        .withDescription("Debug info", "Single error")

      expect(myError.flatten()).toBe("Single error -> Original")
    })

    it("should work with registry-typed faults", () => {
      const rootError = new Error("Invalid credentials")
      const authError = Fault.wrap(rootError)
        .withTag("LAYER_2")
        .withDescription("Auth failed", "Login failed")

      expect(authError.flatten()).toBe("Login failed -> Invalid credentials")
    })

    it("should support custom formatter and separator together", () => {
      const rootError = new Error("Database error")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("DB timeout", "Failed to connect")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Service failed", "Service unavailable")

      const flattened = fault2.flatten({
        formatter: (msg) => msg.toUpperCase(),
        separator: " | ",
      })

      expect(flattened).toBe("SERVICE UNAVAILABLE | FAILED TO CONNECT | DATABASE ERROR")
    })

    it("should deduplicate consecutive identical messages across multiple chained faults", () => {
      const rootError = new Error("Same message")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("Debug 1", "Same message")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Debug 2", "Same message")
      const fault3 = Fault.wrap(fault2)
        .withTag("LAYER_3")
        .withDescription("Debug 3", "Different message")

      const flattened = fault3.flatten()

      expect(flattened).toBe("Different message -> Same message")
    })
  })

  describe("serialization", () => {
    describe("toSerializable", () => {
      it("should serialize a single fault", () => {
        const fault = Fault.create("LAYER_1", {
          database: "postgres",
          host: "localhost",
          port: 5432,
          retries: 3,
          timeout: 5000,
        })
          .withDescription("Failed to connect", "Database unavailable")
          .withMeta({ requestId: "req-123", retryable: true })

        const serialized = Fault.toSerializable(fault)

        expect(serialized).toEqual({
          _isFault: true,
          context: {
            database: "postgres",
            host: "localhost",
            port: 5432,
            retries: 3,
            timeout: 5000,
          },
          details: "Failed to connect",
          message: "Database unavailable",
          meta: { requestId: "req-123", retryable: true },
          name: "Fault[LAYER_1]",
          tag: "LAYER_1",
        })
      })

      it("should serialize a fault without details message", () => {
        const fault = Fault.create("LAYER_2", {
          method: "query",
          service: "database",
          statusCode: 500,
        })

        const serialized = Fault.toSerializable(fault)

        expect(serialized).toEqual({
          _isFault: true,
          context: { method: "query", service: "database", statusCode: 500 },
          message: "",
          name: "Fault[LAYER_2]",
          tag: "LAYER_2",
        })
        expect(serialized.details).toBeUndefined()
      })

      it("should serialize a fault chain", () => {
        const rootError = new Error("Connection timeout")
        const fault1 = Fault.wrap(rootError)
          .withTag("LAYER_1", {
            database: "postgres",
            host: "localhost",
            port: 5432,
          })
          .withMeta({ requestId: "req-1" })

        const fault2 = Fault.wrap(fault1)
          .withTag("LAYER_2", {
            method: "query",
            service: "database",
            statusCode: 500,
          })
          .withMeta({ retryable: true })

        const fault3 = Fault.wrap(fault2)
          .withTag("LAYER_3", {
            endpoint: "/api/users",
            headers: { "Content-Type": "application/json" },
            method: "GET",
            statusCode: 503,
          })
          .withMeta({ traceId: "trace-1" })

        const serialized = Fault.toSerializable(fault3)

        expect(serialized).toEqual({
          _isFault: true,
          cause: {
            _isFault: true,
            cause: {
              _isFault: true,
              cause: {
                message: "Connection timeout",
                name: "Error",
              },
              context: { database: "postgres", host: "localhost", port: 5432 },
              message: "Connection timeout",
              meta: { requestId: "req-1" },
              name: "Fault[LAYER_1]",
              tag: "LAYER_1",
            },
            context: { method: "query", service: "database", statusCode: 500 },
            message: "Connection timeout",
            meta: { retryable: true },
            name: "Fault[LAYER_2]",
            tag: "LAYER_2",
          },
          context: {
            endpoint: "/api/users",
            headers: { "Content-Type": "application/json" },
            method: "GET",
            statusCode: 503,
          },
          message: "Connection timeout",
          meta: { traceId: "trace-1" },
          name: "Fault[LAYER_3]",
          tag: "LAYER_3",
        })
      })

      it("should serialize a fault ending in plain Error", () => {
        const rootError = new Error("Network failure")
        const fault = Fault.wrap(rootError).withTag("LAYER_1").withDescription("Connection failed")

        const serialized = Fault.toSerializable(fault)

        expect(serialized).toEqual({
          _isFault: true,
          cause: {
            message: "Network failure",
            name: "Error",
          },
          details: "Connection failed",
          message: "Network failure",
          name: "Fault[LAYER_1]",
          tag: "LAYER_1",
        })
      })

      it("should serialize a fault without cause", () => {
        const fault = Fault.create("LAYER_2", { service: "database" }).withDescription(
          "Invalid input"
        )

        const serialized = Fault.toSerializable(fault)

        expect(serialized).toEqual({
          _isFault: true,
          context: { service: "database" },
          details: "Invalid input",
          message: "",
          name: "Fault[LAYER_2]",
          tag: "LAYER_2",
        })
        expect(serialized.cause).toBeUndefined()
      })

      it("should serialize empty context", () => {
        const fault = Fault.create("LAYER_3")

        const serialized = Fault.toSerializable(fault)

        expect(serialized.context).toBeUndefined()
      })
    })
  })

  describe("getIssue", () => {
    it("should extract message from single fault", () => {
      const fault = Fault.wrap(new Error("Something happened"))
        .withTag("LAYER_1")
        .withDescription("Debug info", "User-facing message")

      expect(Fault.getIssue(fault)).toBe("User-facing message.")
    })

    it("should extract messages from all faults in chain", () => {
      const rootError = new Error("Database connection failed")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("DB timeout", "Failed to connect to database")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Service failed", "Authentication service unavailable")
      const fault3 = Fault.wrap(fault2)
        .withTag("LAYER_3")
        .withDescription("API failed", "User login failed")

      expect(Fault.getIssue(fault3)).toBe(
        "User login failed. Authentication service unavailable. Failed to connect to database."
      )
    })

    it("should exclude raw error messages, only fault messages", () => {
      const originalError = new Error("Raw error message")
      const fault1 = Fault.wrap(originalError)
        .withTag("LAYER_1")
        .withDescription("Debug info", "Fault message 1")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("More debug", "Fault message 2")

      expect(Fault.getIssue(fault2)).toBe("Fault message 2. Fault message 1.")
    })

    it("should use original error message when no user message provided", () => {
      const originalError = new Error("Original error message")
      const fault = Fault.wrap(originalError).withTag("LAYER_1").withDescription("Debug info")

      expect(Fault.getIssue(fault)).toBe("Original error message.")
    })

    it("should add periods and join with spaces by default", () => {
      const fault1 = Fault.wrap(new Error("Error 1"))
        .withTag("LAYER_1")
        .withDescription("Debug", "Message 1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2").withDescription("Debug", "Message 2")

      const result = Fault.getIssue(fault2)
      expect(result).toBe("Message 2. Message 1.")
    })

    it("should work with registry-typed faults", () => {
      const rootError = new Error("Invalid token")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("Token validation", "Token expired")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Auth failed", "Authentication failed")

      expect(Fault.getIssue(fault2)).toBe("Authentication failed. Token expired.")
    })

    it("should handle empty message strings", () => {
      const emptyError = new Error("placeholder")
      emptyError.message = ""
      const fault = Fault.wrap(emptyError).withTag("LAYER_1")

      // Empty messages are filtered out, so result is empty string
      expect(Fault.getIssue(fault)).toBe("")
    })

    it("should work with single fault without description", () => {
      const fault = Fault.wrap(new Error("Original message")).withTag("LAYER_1")

      expect(Fault.getIssue(fault)).toBe("Original message.")
    })

    it("should not add period if message already has punctuation", () => {
      const fault = Fault.wrap(new Error("Something happened!")).withTag("MY_TAG")

      expect(Fault.getIssue(fault)).toBe("Something happened!")
    })

    it("should allow custom separator", () => {
      const fault1 = Fault.wrap(new Error("Error 1")).withTag("LAYER_1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2").withDescription("Debug", "Error 2")

      expect(Fault.getIssue(fault2, { separator: " | " })).toBe("Error 2. | Error 1.")
    })

    it("should allow custom formatter", () => {
      const fault1 = Fault.wrap(new Error("error 1")).withTag("LAYER_1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2").withDescription("Debug", "error 2")

      expect(Fault.getIssue(fault2, { formatter: (msg) => msg.toUpperCase() })).toBe(
        "ERROR 2 ERROR 1"
      )
    })
  })

  describe("getDetails", () => {
    it("should extract details message from single fault", () => {
      const fault = Fault.wrap(new Error("Something happened"))
        .withTag("MY_TAG")
        .withDescription("Debug message here")

      expect(Fault.getDetails(fault)).toBe("Debug message here.")
    })

    it("should extract details messages from all faults in chain", () => {
      const rootError = new Error("Database connection failed")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("DB timeout on port 5432", "Failed to connect")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Service failed after 3 retries", "Service unavailable")
      const fault3 = Fault.wrap(fault2)
        .withTag("LAYER_3")
        .withDescription("API call timeout", "API failed")

      expect(Fault.getDetails(fault3)).toBe(
        "API call timeout. Service failed after 3 retries. DB timeout on port 5432."
      )
    })

    it("should exclude raw errors, only fault details messages", () => {
      const originalError = new Error("Raw error message")
      const fault1 = Fault.wrap(originalError)
        .withTag("LAYER_1")
        .withDescription("Debug info 1", "Message 1")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Debug info 2", "Message 2")

      expect(Fault.getDetails(fault2)).toBe("Debug info 2. Debug info 1.")
    })

    it("should add periods and join with spaces by default", () => {
      const fault1 = Fault.wrap(new Error("Error 1")).withTag("LAYER_1").withDescription("Debug 1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2").withDescription("Debug 2")

      const result = Fault.getDetails(fault2)
      expect(result).toBe("Debug 2. Debug 1.")
    })

    it("should work with registry-typed faults", () => {
      const rootError = new Error("Invalid token")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("Token validation failed")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Auth service returned 401")

      expect(Fault.getDetails(fault2)).toBe("Auth service returned 401. Token validation failed.")
    })

    it("should handle undefined details messages", () => {
      const fault = Fault.wrap(new Error("Something happened")).withTag("MY_TAG")

      expect(Fault.getDetails(fault)).toBe("")
    })

    it("should handle empty details strings", () => {
      const fault = Fault.wrap(new Error("Error")).withTag("MY_TAG").withDescription("")

      expect(Fault.getDetails(fault)).toBe("")
    })

    it("should filter out undefined/empty details messages in chains", () => {
      const fault1 = Fault.wrap(new Error("Error 1")).withTag("LAYER_1").withDescription("Debug 1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")

      expect(Fault.getDetails(fault2)).toBe("Debug 1.")
    })

    it("should support custom separator", () => {
      const rootError = new Error("Database connection failed")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("DB timeout on port 5432")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Service failed after 3 retries")

      const result = Fault.getDetails(fault2, { separator: " -> " })

      expect(result).toBe("Service failed after 3 retries. -> DB timeout on port 5432.")
    })

    it("should support custom formatter", () => {
      const rootError = new Error("Database connection failed")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("db timeout on port 5432")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("service failed after 3 retries")

      const result = Fault.getDetails(fault2, {
        formatter: (msg) => {
          const trimmed = msg.trim()
          return trimmed ? trimmed.toUpperCase() : ""
        },
      })

      expect(result).toBe("SERVICE FAILED AFTER 3 RETRIES DB TIMEOUT ON PORT 5432")
    })

    it("should filter empty messages after formatting", () => {
      const fault1 = Fault.wrap(new Error("Error 1")).withTag("LAYER_1").withDescription("Debug 1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")

      const result = Fault.getDetails(fault2, {
        formatter: (msg) => (msg.trim() === "" ? "" : msg.toUpperCase()),
      })

      expect(result).toBe("DEBUG 1")
    })
  })

  describe("wrap", () => {
    it("should create a fault", () => {
      const myErr = new Error("Something happened")

      const fault = Fault.wrap(myErr)
        .withTag("MY_TAG", {
          errorCode: 500,
          requestId: "req-123",
          sessionId: "session-789",
          timestamp: 1_234_567_890,
          userId: "user-456",
        })
        .withDescription(myErr.message, "Something went really wrong")

      expect(fault.tag).toBe("MY_TAG")
      expect(fault.details).toBe(myErr.message)
      expect(fault.context).toEqual({
        errorCode: 500,
        requestId: "req-123",
        sessionId: "session-789",
        timestamp: 1_234_567_890,
        userId: "user-456",
      })
    })

    it("should support type-safe tags from registry", () => {
      const fault = Fault.wrap(new Error("test"))
        .withTag("LAYER_1")
        .withDescription("Failed to connect to database")

      expect(fault.tag).toBe("LAYER_1")
    })

    it("should keep the original error message", () => {
      const myErr = new Error("Something happened")

      const fault = Fault.wrap(myErr).withTag("MY_TAG").withDescription("Testing error message")

      expect(fault.message).toBe(myErr.message)
    })

    it("should set the cause to the wrapped error", () => {
      const originalError = new Error("Database connection failed")
      const fault = Fault.wrap(originalError)
        .withTag("LAYER_1")
        .withDescription("Connection timeout after 30s")

      expect(fault.cause).toBe(originalError)
      expect(fault.cause?.message).toBe("Database connection failed")
    })

    it("should inform that no tag was provided", () => {
      const originalError = new Error("Something went wrong")
      const fault = Fault.wrap(originalError).withDescription("Debug message")

      expect(fault.tag).toBe(NO_FAULT_TAG)
      expect(fault.details).toBe("Debug message")
      expect(fault.context).toBeUndefined()
    })

    it("should wrap a string", () => {
      const fault = Fault.wrap("String error")

      expect(fault.cause).toBeInstanceOf(Error)
      expect(fault.cause?.message).toBe("String error")
    })

    it("should wrap a number", () => {
      const fault = Fault.wrap(42)

      expect(fault.cause).toBeInstanceOf(Error)
      expect(fault.cause?.message).toBe("42")
    })

    it("should wrap undefined", () => {
      const undefinedValue: unknown = void 0
      const fault = Fault.wrap(undefinedValue)

      expect(fault.cause).toBeInstanceOf(Error)
      expect(fault.cause?.message).toBe("undefined")
    })

    it("should wrap null", () => {
      const fault = Fault.wrap(null)

      expect(fault.cause).toBeInstanceOf(Error)
      expect(fault.cause?.message).toBe("null")
    })
  })

  describe("fromSerializable", () => {
    it("should deserialize a single fault", () => {
      const serialized = {
        _isFault: true,
        context: { host: "localhost", port: 5432 },
        details: "Failed to connect",
        message: "Database unavailable",
        meta: { requestId: "req-1" },
        name: "Fault[LAYER_1]",
        tag: "LAYER_1" as const,
      }

      const fault = Fault.fromSerializable(serialized)

      expect(fault.name).toBe("Fault[LAYER_1]")
      expect(fault.tag).toBe("LAYER_1")
      expect(fault.message).toBe("Database unavailable")
      expect(fault.details).toBe("Failed to connect")
      expect(fault.context).toEqual({ host: "localhost", port: 5432 })
      expect(fault.meta).toEqual({ requestId: "req-1" })
      expect(fault.cause).toBeUndefined()
    })

    it("should deserialize a fault without details message", () => {
      const serialized = {
        _isFault: true,
        context: { service: "auth" },
        message: "Unauthorized",
        name: "Fault[LAYER_2]",
        tag: "LAYER_2" as const,
      }

      const fault = Fault.fromSerializable(serialized)

      expect(fault.tag).toBe("LAYER_2")
      expect(fault.details).toBeUndefined()
    })

    it("should deserialize a fault chain", () => {
      const serialized = {
        _isFault: true,
        cause: {
          _isFault: true,
          cause: {
            _isFault: true,
            cause: {
              message: "Connection timeout",
              name: "Error",
            },
            context: { host: "localhost", port: 5432 },
            message: "Connection timeout",
            name: "Fault[LAYER_1]",
            tag: "LAYER_1" as const,
          },
          context: { service: "database" },
          message: "Connection timeout",
          name: "Fault[LAYER_2]",
          tag: "LAYER_2" as const,
        },
        context: { endpoint: "/api/users" },
        message: "Connection timeout",
        name: "Fault[LAYER_3]",
        tag: "LAYER_3" as const,
      }

      const fault = Fault.fromSerializable(serialized)
      const chain = fault.unwrap()

      expect(chain).toHaveLength(4)
      expect(Fault.isFault(chain[0]) && chain[0].tag).toBe("LAYER_3")
      expect(Fault.isFault(chain[1]) && chain[1].tag).toBe("LAYER_2")
      expect(Fault.isFault(chain[2]) && chain[2].tag).toBe("LAYER_1")
      expect(chain[3]?.message).toBe("Connection timeout")
      expect(Fault.isFault(chain[3])).toBe(false)
    })

    it("should deserialize a fault ending in plain Error", () => {
      const serialized = {
        _isFault: true,
        cause: {
          message: "Network failure",
          name: "Error",
        },
        context: {},
        details: "Connection failed",
        message: "Network failure",
        name: "Fault[NETWORK_ERROR]",
        tag: "NETWORK_ERROR" as const,
      }

      const fault = Fault.fromSerializable(serialized)
      const chain = fault.unwrap()

      expect(chain).toHaveLength(2)
      expect(Fault.isFault(chain[0])).toBe(true)
      expect(Fault.isFault(chain[1])).toBe(false)
      expect(chain[1]?.message).toBe("Network failure")
    })

    it("should throw when deserializing plain Error as Fault", () => {
      const serialized = {
        message: "Something went wrong",
        name: "Error",
      }

      expect(() => Fault.fromSerializable(serialized)).toThrow(
        "Cannot deserialize SerializableError as Fault"
      )
    })

    it("should throw when name is missing", () => {
      const invalid = { _isFault: true, context: {}, message: "test", tag: "MY_TAG" }
      expect(() => Fault.fromSerializable(invalid as unknown as SerializableFault)).toThrow(
        "'name' must be a string"
      )
    })

    it("should throw when message is missing", () => {
      const invalid = { _isFault: true, context: {}, name: "Fault[MY_TAG]", tag: "MY_TAG" }
      expect(() => Fault.fromSerializable(invalid as unknown as SerializableFault)).toThrow(
        "'message' must be a string"
      )
    })

    it("should throw when context is not an object", () => {
      const invalid = {
        _isFault: true,
        context: "not-object",
        message: "test",
        name: "Fault[MY_TAG]",
        tag: "MY_TAG",
      }
      expect(() => Fault.fromSerializable(invalid as unknown as SerializableFault)).toThrow(
        "'context' must be an object"
      )
    })

    it("should throw when meta is not an object", () => {
      const invalid = {
        _isFault: true,
        message: "test",
        meta: "not-object",
        name: "Fault",
        tag: "MY_TAG",
      }
      expect(() => Fault.fromSerializable(invalid as unknown as SerializableFault)).toThrow(
        "'meta' must be an object"
      )
    })

    it("should handle undefined context gracefully", () => {
      const data = { _isFault: true, message: "test", name: "Fault[MY_TAG]", tag: "MY_TAG" }
      const fault = Fault.fromSerializable(data as unknown as SerializableFault)
      expect(fault.context).toBeUndefined()
    })

    it("should handle undefined meta gracefully", () => {
      const data = { _isFault: true, message: "test", name: "Fault[MY_TAG]", tag: "MY_TAG" }
      const fault = Fault.fromSerializable(data as unknown as SerializableFault)
      expect(fault.meta).toBeUndefined()
    })
  })

  describe("round-trip serialization", () => {
    it("should preserve single fault data through round trip", () => {
      const original = Fault.create("LAYER_1", {
        host: "localhost",
        port: 5432,
      })
        .withDescription("Connection failed", "Database unavailable")
        .withMeta({ requestId: "req-1" })

      const serialized = Fault.toSerializable(original)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json) as SerializableFault
      const restored = Fault.fromSerializable(parsed)

      expect(restored.tag).toBe(original.tag)
      expect(restored.message).toBe(original.message)
      expect(restored.details).toBe(original.details)
      expect(restored.context).toEqual(original.context)
      expect(restored.meta).toEqual(original.meta)
      expect(restored.name).toBe(original.name)
    })

    it("should preserve fault chain through round trip", () => {
      const rootError = new Error("Network timeout")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1", { host: "localhost", port: 5432 })
        .withMeta({ requestId: "req-1" })

      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2", { service: "database" })
        .withMeta({ retryable: true })

      const fault3 = Fault.wrap(fault2)
        .withTag("LAYER_3", { endpoint: "/api/users" })
        .withMeta({ traceId: "trace-1" })

      const serialized = Fault.toSerializable(fault3)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json) as SerializableFault
      const restored = Fault.fromSerializable(parsed)

      const originalChain = fault3.unwrap()
      const restoredChain = restored.unwrap()

      expect(restoredChain).toHaveLength(originalChain.length)

      for (let i = 0; i < originalChain.length; i += 1) {
        const orig = originalChain[i]
        const rest = restoredChain[i]

        expect(rest?.message).toBe(orig?.message)

        if (Fault.isFault(orig)) {
          expect(Fault.isFault(rest)).toBe(true)
          if (Fault.isFault(rest)) {
            expect(rest.tag).toBe(orig.tag)
            expect(rest.context).toEqual(orig.context)
            expect(rest.meta).toEqual(orig.meta)
            expect(rest.details).toBe(orig.details)
          }
        }
      }
    })

    it("should preserve empty context through round trip", () => {
      const original = Fault.create("MY_TAG")

      const serialized = Fault.toSerializable(original)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json) as SerializableFault
      const restored = Fault.fromSerializable(parsed)

      expect(restored.context).toBeUndefined()
    })

    it("should preserve tags and contexts in chain", () => {
      const root = new Error("Root cause")
      const fault1 = Fault.wrap(root)
        .withTag("LAYER_1", { host: "localhost", port: 5432 })
        .withDescription("Layer 1 debug")

      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2", { service: "database" })
        .withDescription("Layer 2 debug", "Layer 2 message")

      const serialized = Fault.toSerializable(fault2)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json) as SerializableFault
      const restored = Fault.fromSerializable(parsed)

      expect(restored.getTags()).toEqual(["LAYER_2", "LAYER_1"])
      expect(restored.tag).toBe("LAYER_2")
      expect(restored.message).toBe("Layer 2 message")
      expect(restored.details).toBe("Layer 2 debug")

      const chain = restored.unwrap()
      if (Fault.isFault(chain[1])) {
        expect(chain[1].tag).toBe("LAYER_1")
        expect(chain[1].details).toBe("Layer 1 debug")
      }
    })
  })

  describe("findCause", () => {
    it("should find error in chain", () => {
      class HttpError extends Error {
        constructor(
          message: string,
          public statusCode: number
        ) {
          super(message)
        }
      }

      const httpError = new HttpError("Not found", 404)
      const fault = Fault.wrap(httpError).withTag("MY_TAG")

      const found = Fault.findCause(fault, HttpError)
      expect(found).toBe(httpError)
      expect(found?.statusCode).toBe(404)
    })

    it("should return undefined if not found", () => {
      class HttpError extends Error {
        constructor(
          message: string,
          public statusCode: number
        ) {
          super(message)
        }
      }

      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG")

      const found = Fault.findCause(fault, HttpError)
      expect(found).toBeUndefined()
    })

    it("should return undefined for non-Error values", () => {
      class HttpError extends Error {
        constructor(
          message: string,
          public statusCode: number
        ) {
          super(message)
        }
      }

      const found = Fault.findCause("not an error", HttpError)
      expect(found).toBeUndefined()
    })

    it("should find error in deep chain", () => {
      class HttpError extends Error {
        constructor(
          message: string,
          public statusCode: number
        ) {
          super(message)
        }
      }

      const httpError = new HttpError("Not found", 404)
      const fault1 = Fault.wrap(httpError).withTag("LAYER_1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")
      const fault3 = Fault.wrap(fault2).withTag("LAYER_3")

      const found = Fault.findCause(fault3, HttpError)
      expect(found).toBe(httpError)
      expect(found?.statusCode).toBe(404)
    })

    it("should return the first matching error in chain", () => {
      class HttpError extends Error {
        constructor(
          message: string,
          public statusCode: number
        ) {
          super(message)
        }
      }

      const innerError = new HttpError("Inner", 500)
      const fault1 = Fault.wrap(innerError).withTag("LAYER_1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")
      // Wrap the chain with another HttpError
      const combined = new HttpError("Combined", 503)
      combined.cause = fault2

      const found = Fault.findCause(combined, HttpError)
      expect(found).toBe(combined) // First match is the outermost
      expect(found?.statusCode).toBe(503)
    })

    it("should find Fault instance in chain", () => {
      const innerFault = Fault.wrap(new Error("inner")).withTag("LAYER_1")
      const outerFault = Fault.wrap(innerFault).withTag("LAYER_2")

      const found = Fault.findCause(outerFault, Fault)
      expect(found).toBe(outerFault) // First match is outerFault itself
    })

    it("should handle errors with null cause", () => {
      class HttpError extends Error {
        constructor(
          message: string,
          public statusCode: number
        ) {
          super(message)
        }
      }

      const error = new Error("test")
      // Testing runtime behavior with null cause
      error.cause = null

      const found = Fault.findCause(error, HttpError)
      expect(found).toBeUndefined()
    })
  })

  describe("custom methods", () => {
    // Extended Fault class with custom methods
    class AppFault extends Faultier.define<{
      "db.connection_failed": { host: string }
      "db.timeout": { timeoutMs: number }
      "auth.unauthenticated": { requestId?: string }
      "validation.failed": { field: string }
    }>() {
      isRetryable(): boolean {
        return ["db.connection_failed", "db.timeout"].includes(this.tag)
      }

      toHttpStatus(): number {
        const statusMap: Record<string, number> = {
          "auth.unauthenticated": 401,
          "db.connection_failed": 503,
          "db.timeout": 504,
          "validation.failed": 400,
        }
        return statusMap[this.tag] ?? 500
      }

      static customStaticMethod(): string {
        return "custom"
      }
    }

    it("should allow custom instance methods", () => {
      const fault = AppFault.create("db.timeout", { timeoutMs: 5000 })
      expect(fault.isRetryable()).toBe(true)
      expect(fault.toHttpStatus()).toBe(504)
    })

    it("should return false for non-retryable errors", () => {
      const fault = AppFault.create("auth.unauthenticated")
      expect(fault.isRetryable()).toBe(false)
      expect(fault.toHttpStatus()).toBe(401)
    })

    it("should allow custom static methods", () => {
      expect(AppFault.customStaticMethod()).toBe("custom")
    })

    it("should preserve custom methods through chaining", () => {
      const fault = AppFault.create("db.timeout", { timeoutMs: 5000 }).withDescription(
        "Connection timed out"
      )

      // Custom methods should still be accessible after chaining
      expect(fault.isRetryable()).toBe(true)
    })

    it("should work with instanceof for extended class", () => {
      const fault = AppFault.create("db.timeout", { timeoutMs: 5000 })
      expect(fault instanceof AppFault).toBe(true)
      expect(fault instanceof Error).toBe(true)
    })

    it("should work with wrapped errors and custom methods", () => {
      const originalError = new Error("Connection refused")
      const fault = AppFault.wrap(originalError).withTag("db.connection_failed", {
        host: "localhost",
      })

      expect(fault.isRetryable()).toBe(true)
      expect(fault.toHttpStatus()).toBe(503)
    })

    it("should preserve custom methods after multiple chaining operations", () => {
      const fault = AppFault.create("db.timeout", { timeoutMs: 5000 })
        .withDescription("Debug info", "User message")
        .withDetails("More debug")
        .withMessage("Final message")

      expect(fault.isRetryable()).toBe(true)
      expect(fault.toHttpStatus()).toBe(504)
      expect(fault instanceof AppFault).toBe(true)
    })
  })
})
