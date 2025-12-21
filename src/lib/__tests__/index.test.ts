import { describe, expect, it } from "bun:test"
import Fault, { IS_FAULT, UNKNOWN } from "../index"
import type { FaultTag } from "../types"

declare module "../types" {
  interface FaultRegistry {
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
    NO_CONTEXT_TAG: never // Tag that doesn't accept context
  }
}

describe("Fault", () => {
  describe("toJSON", () => {
    it("should use getIssue and getDebug helpers for message and debug", () => {
      const err = new Error("Something happened")
      const fault = Fault.wrap(err)
        .withTag("MY_TAG")
        .withDescription("Something went really wrong")
        .withContext({ requestId: "123", errorCode: 100 })

      expect(JSON.stringify(fault)).toEqual(
        JSON.stringify({
          name: "Fault",
          tag: "MY_TAG",
          message: "Something happened.",
          debug: "Something went really wrong.",
          context: { requestId: "123", errorCode: 100 },
          cause: "Something happened",
        })
      )
    })

    it("should aggregate messages from fault chain", () => {
      const rootError = new Error("Database connection failed")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("DB timeout", "Failed to connect to database")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Service failed", "Authentication service unavailable")

      const json = JSON.parse(JSON.stringify(fault2))

      expect(json.message).toBe(
        "Authentication service unavailable. → Failed to connect to database."
      )
      expect(json.debug).toBe("Service failed. → DB timeout.")
    })
  })

  describe("modifiers", () => {
    it("should apply the modifiers to the fault", () => {
      const fault = Fault.wrap(new Error("something happened"))
        .withTag("MY_TAG")
        .withDescription("Something went really wrong")
        .withContext({ requestId: "123", errorCode: 100 })

      expect(fault.name).toBe("Fault")
      expect(fault.tag).toBe("MY_TAG")
      expect(fault.message).toBe("something happened")
      expect(fault.debug).toBe("Something went really wrong")
      expect(fault.context).toEqual({ requestId: "123", errorCode: 100 })
    })

    describe("withTag", () => {
      it("should set the tag", () => {
        const tag = "MY_TAG"
        const fault = Fault.wrap(new Error("something happened")).withTag(tag)
        expect(fault.tag).toBe(tag)
      })
    })

    describe("withDescription", () => {
      it("should preserve the original message", () => {
        const fault = Fault.wrap(new Error("something happened")).withDescription(
          "Something went really wrong"
        )

        expect(fault.debug).toBe("Something went really wrong")
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

    describe("withDebug", () => {
      it("should set only the debug message, preserving the original message", () => {
        const fault = Fault.wrap(new Error("something happened")).withDebug(
          "Something went really wrong"
        )

        expect(fault.debug).toBe("Something went really wrong")
        expect(fault.message).toBe("something happened")
      })

      it("should allow chaining", () => {
        const fault = Fault.wrap(new Error("test"))
          .withTag("MY_TAG")
          .withDebug("Debug message")
          .withContext({ requestId: "123" })

        expect(fault.debug).toBe("Debug message")
        expect(fault.tag).toBe("MY_TAG")
        expect(fault.context).toEqual({ requestId: "123" })
      })
    })

    describe("withMessage", () => {
      it("should set only the message, not affecting debug", () => {
        const fault = Fault.wrap(new Error("original message"))
          .withDescription("Debug info")
          .withMessage("User-facing message")

        expect(fault.message).toBe("User-facing message")
        expect(fault.debug).toBe("Debug info")
      })

      it("should override message without setting debug", () => {
        const fault = Fault.wrap(new Error("original message")).withMessage("New message")

        expect(fault.message).toBe("New message")
        expect(fault.debug).toBeUndefined()
      })

      it("should allow chaining", () => {
        const fault = Fault.wrap(new Error("test"))
          .withTag("MY_TAG")
          .withMessage("User message")
          .withContext({ requestId: "123" })

        expect(fault.message).toBe("User message")
        expect(fault.tag).toBe("MY_TAG")
        expect(fault.context).toEqual({ requestId: "123" })
      })
    })

    describe("withContext", () => {
      it("should default to empty object", () => {
        const fault = Fault.wrap(new Error("test"))

        // @ts-expect-error - we want to test the default context
        expect(fault.context).toEqual({})
      })

      it("should prevent withContext on tags with never context type", () => {
        const fault = Fault.create("NO_CONTEXT_TAG")

        // @ts-expect-error - withContext should return never for tags with never context
        // This verifies that TypeScript correctly prevents calling withContext on tags with never context
        const _result = fault.withContext({ any: "value" })

        // At runtime, withContext would still execute, but TypeScript prevents the call
        // The @ts-expect-error above verifies the type error exists
      })
    })

    describe("clearContext", () => {
      it("should return FaultWithTag preserving tag and message with empty context", () => {
        const fault = Fault.wrap(new Error("Original error"))
          .withTag("MY_TAG")
          .withDescription("Debug message", "User message")
          .withContext({ requestId: "123", errorCode: 100 })

        const cleared = fault.clearContext()

        expect(cleared.tag).toBe("MY_TAG")
        expect(cleared.message).toBe("User message")
        expect(cleared.context).toEqual({} as never)
      })

      it("should allow re-applying context after clearing", () => {
        const fault = Fault.wrap(new Error("Original error"))
          .withTag("MY_TAG")
          .withContext({ requestId: "123", errorCode: 100 })

        const cleared = fault.clearContext()
        const recontexted = cleared.withContext({
          requestId: "456",
          userId: "user1",
        })

        expect(recontexted.tag).toBe("MY_TAG")
        expect(recontexted.context).toEqual({
          requestId: "456",
          userId: "user1",
        })
        expect(recontexted.getFullContext()).toEqual({
          requestId: "456",
          userId: "user1",
        })
      })
    })
  })

  describe("isFault", () => {
    it("should return true if the value is a fault", () => {
      const err = new Error("Something happened")

      const fault = Fault.wrap(err).withTag("MY_TAG").withDescription("Something went really wrong")

      expect(Fault.isFault(new Date())).toBe(false)
      expect(Fault.isFault(null)).toBe(false)
      expect(Fault.isFault(undefined)).toBe(false)
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
        tag: "MY_TAG",
        context: {},
      }

      expect(Fault.isFault(fakeFault)).toBe(true)
    })

    it("should return false if IS_FAULT symbol is present but not true", () => {
      const fakeFault = {
        [IS_FAULT]: false,
        tag: "MY_TAG",
        context: {},
      }

      expect(Fault.isFault(fakeFault)).toBe(false)
    })
  })

  describe("assert", () => {
    it("should not throw when given a Fault instance", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG")

      expect(() => Fault.assert(fault)).not.toThrow()
    })

    it("should throw the original error when given a non-fault", () => {
      const plainError = new Error("Not a fault")

      expect(() => Fault.assert(plainError)).toThrow(plainError)
    })

    it("should throw non-Error values", () => {
      expect(() => Fault.assert("not an error")).toThrow("not an error")
      expect(() => {
        try {
          Fault.assert(null)
        } catch (e) {
          expect(e).toBe(null)
          throw e
        }
      }).toThrow()
    })
  })

  describe("handle", () => {
    it("should return handler result when error is a Fault with matching handler", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG")

      const result = Fault.handle(fault, {
        MY_TAG: () => "handled",
        LAYER_1: () => "not handled",
        LAYER_2: () => "not handled",
        LAYER_3: () => "not handled",
        NO_CONTEXT_TAG: () => "not handled",
      })

      expect(result).toBe("handled")
    })

    it("should return UNKNOWN when error is not a fault", () => {
      const plainError = new Error("Not a fault")

      const result = Fault.handle(plainError, {
        MY_TAG: () => "handled",
        LAYER_1: () => "handled",
        LAYER_2: () => "handled",
        LAYER_3: () => "handled",
        NO_CONTEXT_TAG: () => "handled",
      })

      expect(result).toBe(UNKNOWN)
    })

    it("should return UNKNOWN when error is a Fault but no handler exists for tag", () => {
      const fault = Fault.wrap(new Error("test"))

      // Use type assertion to test runtime behavior when handler is missing
      const result = Fault.handle(fault, {
        LAYER_1: () => "handled",
        LAYER_2: () => "handled",
        LAYER_3: () => "handled",
        MY_TAG: () => "handled",
        NO_CONTEXT_TAG: () => "handled",
      })

      expect(result).toBe(UNKNOWN)
    })

    it("should only invoke the matching handler", () => {
      const fault = Fault.wrap(new Error("test")).withTag("LAYER_1")
      const handler1 = () => "handler1"
      const handler2 = () => "handler2"
      const handler3 = () => "handler3"
      const handler4 = () => "handler4"
      const handler5 = () => "handler5"

      const spy1 = handler1
      const spy2 = handler2
      const spy3 = handler3
      const spy4 = handler4
      const spy5 = handler5

      const result = Fault.handle(fault, {
        MY_TAG: spy1,
        LAYER_1: spy2,
        LAYER_2: spy3,
        LAYER_3: spy4,
        NO_CONTEXT_TAG: spy5,
      })

      expect(result).toBe("handler2")
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
      const fault1 = Fault.wrap(dbError)
        .withTag("LAYER_1")
        .withContext({ host: "localhost", port: 5432 })
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2").withContext({ service: "auth" })
      const fault3 = Fault.wrap(fault2).withTag("LAYER_3").withContext({ endpoint: "/login" })

      const chain = fault3.unwrap()
      expect(chain).toHaveLength(4)
      expect(chain[0]).toBe(fault3)
      expect(chain[1]).toBe(fault2)
      expect(chain[2]).toBe(fault1)
      expect(chain[3]).toBe(dbError)

      const filtered = chain.filter(Fault.isFault)

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
      const tags = chain.filter(Fault.isFault).map((f) => f.tag)

      expect(tags).toEqual(["LAYER_3", "LAYER_2", "LAYER_1"])
    })

    it("should merge contexts from all faults in chain", () => {
      const dbError = new Error("Database timeout")
      const fault1 = Fault.wrap(dbError)
        .withTag("LAYER_1")
        .withContext({ host: "localhost", port: 5432 })
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2").withContext({ service: "auth" })
      const fault3 = Fault.wrap(fault2).withTag("LAYER_3").withContext({ endpoint: "/login" })

      const chain = fault3.unwrap()
      const faults = chain.filter(Fault.isFault)
      const mergedContext: Record<string, unknown> = {}
      for (const fault of faults) {
        for (const [key, value] of Object.entries(fault.context ?? {})) {
          mergedContext[key] = value
        }
      }

      expect(mergedContext).toEqual({
        endpoint: "/login",
        service: "auth",
        host: "localhost",
        port: 5432,
      })
    })

    it("should get root cause from chain", () => {
      const rootError = new Error("Root cause")
      const fault1 = Fault.wrap(rootError).withTag("LAYER_1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")
      const fault3 = Fault.wrap(fault2).withTag("LAYER_3")

      const chain = fault3.unwrap()
      // biome-ignore lint: Tuple type from unwrap() doesn't support .at() method, and TS target may not support it
      const root = chain[chain.length - 1]

      expect(root).toBe(rootError)
      expect(root?.message).toBe("Root cause")
    })
  })

  describe("getFullContext", () => {
    it("should merge context from all faults in chain", () => {
      const dbError = new Error("Database timeout")
      const fault1 = Fault.wrap(dbError)
        .withTag("LAYER_1")
        .withContext({ host: "localhost", port: 5432 })
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2").withContext({ service: "auth" })
      const fault3 = Fault.wrap(fault2).withTag("LAYER_3").withContext({ endpoint: "/login" })

      const fullContext = fault3.getFullContext()

      expect(fullContext).toEqual({
        host: "localhost",
        port: 5432,
        service: "auth",
        endpoint: "/login",
      })
    })

    it("should override duplicate keys from root to current", () => {
      const fault1 = Fault.wrap(new Error("test")).withTag("MY_TAG").withContext({
        requestId: "abc",
        errorCode: 100,
        userId: "user123",
      })
      const fault2 = Fault.wrap(fault1).withTag("MY_TAG").withContext({
        errorCode: 200,
        requestId: "def",
        sessionId: "session456",
      })

      const fullContext = fault2.getFullContext()

      // errorCode and requestId from fault2 should override fault1
      expect(fullContext).toEqual({
        errorCode: 200,
        requestId: "def",
        userId: "user123",
        sessionId: "session456",
      })
    })

    it("should work with single fault", () => {
      const fault = Fault.wrap(new Error("test")).withTag("MY_TAG").withContext({
        requestId: "value",
      })

      expect(fault.getFullContext()).toEqual({ requestId: "value" })
    })

    it("should work with registry-typed faults", () => {
      const fault1 = Fault.wrap(new Error("test")).withTag("MY_TAG").withContext({
        errorCode: 100,
      })
      const fault2 = Fault.wrap(fault1).withTag("MY_TAG").withContext({
        errorCode: 200,
      })

      expect(fault2.getFullContext()).toEqual({
        errorCode: 200,
      })
    })

    it("should handle empty contexts", () => {
      const fault1 = Fault.wrap(new Error("test"))
      const fault2 = Fault.wrap(fault1).withTag("MY_TAG").withContext({ requestId: "value" })

      expect(fault2.getFullContext()).toEqual({ requestId: "value" })
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

      // Should only include the fault tag, not anything from the raw error
      expect(fault.getTags()).toEqual(["LAYER_1"])
    })

    it("should include 'No fault tag set' when no tag is set", () => {
      const fault = Fault.wrap(new Error("test"))
      // No .withTag() called

      const tags = fault.getTags()

      // Should include the default tag value
      expect(tags).toEqual(["No fault tag set" as FaultTag])
      expect(fault.tag).toBe("No fault tag set")
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

      // Wrapped errors with same message are deduplicated
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
        separator: " | ",
        formatter: (msg) => msg.toUpperCase(),
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

      // Should deduplicate the consecutive "Same message" entries
      expect(flattened).toBe("Different message -> Same message")
    })
  })

  describe("serialization", () => {
    describe("toSerializable", () => {
      it("should serialize a single fault", () => {
        const fault = Fault.create("LAYER_1")
          .withDescription("Failed to connect", "Database unavailable")
          .withContext({
            host: "localhost",
            port: 5432,
            database: "postgres",
            timeout: 5000,
            retries: 3,
          })

        const serialized = Fault.toSerializable(fault)

        expect(serialized).toEqual({
          name: "Fault",
          tag: "LAYER_1",
          message: "Database unavailable",
          debug: "Failed to connect",
          context: {
            host: "localhost",
            port: 5432,
            database: "postgres",
            timeout: 5000,
            retries: 3,
          },
        })
      })

      it("should serialize a fault without debug message", () => {
        const fault = Fault.create("LAYER_2").withContext({
          service: "database",
          method: "query",
          statusCode: 500,
        })

        const serialized = Fault.toSerializable(fault)

        expect(serialized).toEqual({
          name: "Fault",
          tag: "LAYER_2",
          message: "",
          context: { service: "database", method: "query", statusCode: 500 },
        })
        expect(serialized.debug).toBeUndefined()
      })

      it("should serialize a fault chain", () => {
        const rootError = new Error("Connection timeout")
        const fault1 = Fault.wrap(rootError)
          .withTag("LAYER_1")
          .withContext({ host: "localhost", port: 5432, database: "postgres" })

        const fault2 = Fault.wrap(fault1).withTag("LAYER_2").withContext({
          service: "database",
          method: "query",
          statusCode: 500,
        })

        const fault3 = Fault.wrap(fault2)
          .withTag("LAYER_3")
          .withContext({
            endpoint: "/api/users",
            method: "GET",
            statusCode: 503,
            headers: { "Content-Type": "application/json" },
          })

        const serialized = Fault.toSerializable(fault3)

        expect(serialized).toEqual({
          name: "Fault",
          tag: "LAYER_3",
          message: "Connection timeout",
          context: {
            endpoint: "/api/users",
            method: "GET",
            statusCode: 503,
            headers: { "Content-Type": "application/json" },
          },
          cause: {
            name: "Fault",
            tag: "LAYER_2",
            message: "Connection timeout",
            context: { service: "database", method: "query", statusCode: 500 },
            cause: {
              name: "Fault",
              tag: "LAYER_1",
              message: "Connection timeout",
              context: { host: "localhost", port: 5432, database: "postgres" },
              cause: {
                name: "Error",
                message: "Connection timeout",
              },
            },
          },
        })
      })

      it("should serialize a fault ending in plain Error", () => {
        const rootError = new Error("Network failure")
        const fault = Fault.wrap(rootError).withTag("LAYER_1").withDescription("Connection failed")

        const serialized = Fault.toSerializable(fault)

        expect(serialized).toEqual({
          name: "Fault",
          tag: "LAYER_1",
          message: "Network failure",
          debug: "Connection failed",
          context: {},
          cause: {
            name: "Error",
            message: "Network failure",
          },
        })
      })

      it("should serialize a fault without cause", () => {
        const fault = Fault.create("LAYER_2")
          .withDescription("Invalid input")
          .withContext({ service: "database" })

        const serialized = Fault.toSerializable(fault)

        expect(serialized).toEqual({
          name: "Fault",
          tag: "LAYER_2",
          message: "",
          debug: "Invalid input",
          context: { service: "database" },
        })
        expect(serialized.cause).toBeUndefined()
      })

      it("should serialize empty context", () => {
        const fault = Fault.create("LAYER_3")

        const serialized = Fault.toSerializable(fault)

        expect(serialized.context).toEqual({})
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

      // Should only include fault messages, not the raw error message
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
      // biome-ignore lint/suspicious/useErrorMessage: we want to test the empty string case
      const fault = Fault.wrap(new Error("")).withTag("LAYER_1")

      expect(Fault.getIssue(fault)).toBe(".")
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

  describe("getDebug", () => {
    it("should extract debug message from single fault", () => {
      const fault = Fault.wrap(new Error("Something happened"))
        .withTag("MY_TAG")
        .withDescription("Debug message here")

      expect(Fault.getDebug(fault)).toBe("Debug message here.")
    })

    it("should extract debug messages from all faults in chain", () => {
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

      expect(Fault.getDebug(fault3)).toBe(
        "API call timeout. Service failed after 3 retries. DB timeout on port 5432."
      )
    })

    it("should exclude raw errors, only fault debug messages", () => {
      const originalError = new Error("Raw error message")
      const fault1 = Fault.wrap(originalError)
        .withTag("LAYER_1")
        .withDescription("Debug info 1", "Message 1")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Debug info 2", "Message 2")

      // Should only include fault debug messages, not the raw error message
      expect(Fault.getDebug(fault2)).toBe("Debug info 2. Debug info 1.")
    })

    it("should add periods and join with spaces by default", () => {
      const fault1 = Fault.wrap(new Error("Error 1")).withTag("LAYER_1").withDescription("Debug 1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2").withDescription("Debug 2")

      const result = Fault.getDebug(fault2)
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

      expect(Fault.getDebug(fault2)).toBe("Auth service returned 401. Token validation failed.")
    })

    it("should handle undefined debug messages", () => {
      const fault = Fault.wrap(new Error("Something happened")).withTag("MY_TAG")

      // When debug is undefined, it becomes empty string after filtering
      expect(Fault.getDebug(fault)).toBe("")
    })

    it("should handle empty debug strings", () => {
      const fault = Fault.wrap(new Error("Error")).withTag("MY_TAG").withDescription("")

      expect(Fault.getDebug(fault)).toBe("")
    })

    it("should filter out undefined/empty debug messages in chains", () => {
      const fault1 = Fault.wrap(new Error("Error 1")).withTag("LAYER_1").withDescription("Debug 1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")
      // No debug description

      expect(Fault.getDebug(fault2)).toBe("Debug 1.")
    })

    it("should support custom separator", () => {
      const rootError = new Error("Database connection failed")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("DB timeout on port 5432")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Service failed after 3 retries")

      const result = Fault.getDebug(fault2, { separator: " -> " })

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

      const result = Fault.getDebug(fault2, {
        formatter: (msg) => {
          const trimmed = msg.trim()
          return trimmed ? trimmed.toUpperCase() : ""
        },
      })

      // Custom formatter replaces default, so no automatic period addition
      expect(result).toBe("SERVICE FAILED AFTER 3 RETRIES DB TIMEOUT ON PORT 5432")
    })

    it("should filter empty messages after formatting", () => {
      const fault1 = Fault.wrap(new Error("Error 1")).withTag("LAYER_1").withDescription("Debug 1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")
      // No debug description

      const result = Fault.getDebug(fault2, {
        formatter: (msg) => (msg.trim() === "" ? "" : msg.toUpperCase()),
      })

      // Should filter out empty strings after formatting
      // Custom formatter replaces default, so no automatic period addition
      expect(result).toBe("DEBUG 1")
    })
  })

  describe("wrap", () => {
    it("should create a fault", () => {
      const myErr = new Error("Something happened")

      const fault = Fault.wrap(myErr)
        .withTag("MY_TAG")
        .withDescription(myErr.message, "Something went really wrong")
        .withContext({
          requestId: "req-123",
          errorCode: 500,
          userId: "user-456",
          sessionId: "session-789",
          timestamp: 1_234_567_890,
        })

      expect(fault.tag).toBe("MY_TAG")
      expect(fault.debug).toBe(myErr.message)
      expect(fault.context).toEqual({
        requestId: "req-123",
        errorCode: 500,
        userId: "user-456",
        sessionId: "session-789",
        timestamp: 1_234_567_890,
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

      expect(fault.tag).toBe("No fault tag set")
      expect(fault.debug).toBe("Debug message")
      expect(fault.context).toEqual({} as never)
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
      const fault = Fault.wrap(undefined)

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
        name: "Fault",
        tag: "LAYER_1" as const,
        message: "Database unavailable",
        debug: "Failed to connect",
        context: { host: "localhost", port: 5432 },
      }

      const fault = Fault.fromSerializable(serialized)

      expect(fault.name).toBe("Fault")
      expect(fault.tag).toBe("LAYER_1")
      expect(fault.message).toBe("Database unavailable")
      expect(fault.debug).toBe("Failed to connect")
      expect(fault.context).toEqual({ host: "localhost", port: 5432 })
      expect(fault.cause).toBeUndefined()
    })

    it("should deserialize a fault without debug message", () => {
      const serialized = {
        name: "Fault",
        tag: "LAYER_2" as const,
        message: "Unauthorized",
        context: { service: "auth" },
      }

      const fault = Fault.fromSerializable(serialized)

      expect(fault.tag).toBe("LAYER_2")
      expect(fault.debug).toBeUndefined()
    })

    it("should deserialize a fault chain", () => {
      const serialized = {
        name: "Fault",
        tag: "LAYER_3" as const,
        message: "Connection timeout",
        context: { endpoint: "/api/users" },
        cause: {
          name: "Fault",
          tag: "LAYER_2" as const,
          message: "Connection timeout",
          context: { service: "database" },
          cause: {
            name: "Fault",
            tag: "LAYER_1" as const,
            message: "Connection timeout",
            context: { host: "localhost", port: 5432 },
            cause: {
              name: "Error",
              message: "Connection timeout",
            },
          },
        },
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
        name: "Fault",
        tag: "NETWORK_ERROR" as const,
        message: "Network failure",
        debug: "Connection failed",
        context: {},
        cause: {
          name: "Error",
          message: "Network failure",
        },
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
        name: "Error",
        message: "Something went wrong",
      }

      expect(() => Fault.fromSerializable(serialized)).toThrow(
        "Cannot deserialize SerializableError as Fault"
      )
    })
  })

  describe("round-trip serialization", () => {
    it("should preserve single fault data through round trip", () => {
      const original = Fault.create("LAYER_1")
        .withDescription("Connection failed", "Database unavailable")
        .withContext({ host: "localhost", port: 5432 })

      const serialized = Fault.toSerializable(original)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json)
      const restored = Fault.fromSerializable(parsed)

      expect(restored.tag).toBe(original.tag)
      expect(restored.message).toBe(original.message)
      expect(restored.debug).toBe(original.debug)
      expect(restored.context).toEqual(original.context)
      expect(restored.name).toBe(original.name)
    })

    it("should preserve fault chain through round trip", () => {
      const rootError = new Error("Network timeout")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withContext({ host: "localhost", port: 5432 })

      const fault2 = Fault.wrap(fault1).withTag("LAYER_2").withContext({ service: "database" })

      const fault3 = Fault.wrap(fault2).withTag("LAYER_3").withContext({ endpoint: "/api/users" })

      const serialized = Fault.toSerializable(fault3)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json)
      const restored = Fault.fromSerializable(parsed)

      const originalChain = fault3.unwrap()
      const restoredChain = restored.unwrap()

      expect(restoredChain).toHaveLength(originalChain.length)

      for (let i = 0; i < originalChain.length; i++) {
        const orig = originalChain[i]
        const rest = restoredChain[i]

        expect(rest?.message).toBe(orig?.message)

        if (Fault.isFault(orig)) {
          expect(Fault.isFault(rest)).toBe(true)
          if (Fault.isFault(rest)) {
            expect(rest.tag).toBe(orig.tag)
            expect(rest.context).toEqual(orig.context)
            expect(rest.debug).toBe(orig.debug)
          }
        }
      }
    })

    it("should preserve empty context through round trip", () => {
      const original = Fault.create("MY_TAG")

      const serialized = Fault.toSerializable(original)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json)
      const restored = Fault.fromSerializable(parsed)

      expect(restored.context).toEqual({})
    })

    it("should preserve tags and contexts in chain", () => {
      const root = new Error("Root cause")
      const fault1 = Fault.wrap(root)
        .withTag("LAYER_1")
        .withContext({ host: "localhost", port: 5432 })
        .withDescription("Layer 1 debug")

      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withContext({ service: "database" })
        .withDescription("Layer 2 debug", "Layer 2 message")

      const serialized = Fault.toSerializable(fault2)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json)
      const restored = Fault.fromSerializable(parsed)

      expect(restored.getTags()).toEqual(["LAYER_2", "LAYER_1"])
      expect(restored.tag).toBe("LAYER_2")
      expect(restored.message).toBe("Layer 2 message")
      expect(restored.debug).toBe("Layer 2 debug")

      const chain = restored.unwrap()
      if (Fault.isFault(chain[1])) {
        expect(chain[1].tag).toBe("LAYER_1")
        expect(chain[1].debug).toBe("Layer 1 debug")
      }
    })
  })
})
