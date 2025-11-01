import { describe, expect, it } from "bun:test"
import BaseFault from "../base"
import Fault from "../core"

type TestErrorCode =
  | "AUTH_ERROR"
  | "DATABASE_ERROR"
  | "FAULT"
  | "HTTP_ERROR"
  | "INPUT_ERROR"
  | "LAYER_1"
  | "LAYER_2"
  | "LAYER_3"
  | "MY_ERROR_TAG"
  | "MY_TAG"
  | "NETWORK_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "REQUEST_FAILED"
  | "SERVICE_ERROR"
  | "VALIDATION_ERROR"
  | "TEST"

interface TestContext extends Record<TestErrorCode, Record<string, unknown>> {
  FAULT: Record<string, unknown>
  MY_TAG: { requestId: string }
  MY_ERROR_TAG: { errorCode: number }
  LAYER_1: { host: string; port: number }
  LAYER_2: { service: string }
  LAYER_3: { endpoint: string }
}

declare module "../index" {
  interface FaultRegistry {
    tags: TestErrorCode
    context: TestContext
  }
}

describe("BaseFault", () => {
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
        const tag = "MY_ERROR_TAG"
        const fault = Fault.wrap(new Error("something happened")).withTag(tag)
        expect(fault.tag).toBe(tag)
      })
    })

    describe("withDescription", () => {
      it("should preserve the original message", () => {
        const fault = Fault.wrap(
          new Error("something happened")
        ).withDescription("Something went really wrong")

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

    describe("withContext", () => {
      it("should merge object contexts", () => {
        const fault = Fault.wrap(new Error("test"))
          .withContext({ userId: "123", requestId: "abc" })
          .withContext({ userId: "456", sessionId: "xyz" })

        expect(fault.context).toEqual({
          userId: "456",
          requestId: "abc",
          sessionId: "xyz",
        })
      })

      it("should default to empty object", () => {
        const fault = Fault.wrap(new Error("test"))

        expect(fault.context).toEqual({})
      })

      it("should merge multiple times", () => {
        const fault = Fault.wrap(new Error("test"))
          .withContext({ a: 1 })
          .withContext({ b: 2 })
          .withContext({ c: 3 })

        expect(fault.context).toEqual({ a: 1, b: 2, c: 3 })
      })

      it("should override keys when merging", () => {
        const fault = Fault.wrap(new Error("test"))
          .withContext({ key: "value1", other: "data" })
          .withContext({ key: "value2" })

        expect(fault.context).toEqual({ key: "value2", other: "data" })
      })

      it("should clear context with clearContext", () => {
        const fault = Fault.wrap(new Error("test"))
          .withContext({ userId: "123", requestId: "abc" })
          .clearContext()

        expect(fault.context).toEqual({})
      })

      it("should allow rebuilding context after clearing", () => {
        const fault = Fault.wrap(new Error("test"))
          .withContext({ a: 1, b: 2 })
          .clearContext()
          .withContext({ c: 3 })

        expect(fault.context).toEqual({ c: 3 })
      })
    })
  })

  describe("isFault", () => {
    it("should return true if the value is a fault", () => {
      const err = new Error("Something happened")

      const fault = Fault.wrap(err)
        .withTag("MY_TAG")
        .withDescription("Something went really wrong")

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
      const fault = Fault.wrap(new Error("test")).withTag("DATABASE_ERROR")

      if (Fault.isFault(fault)) {
        // Type should be narrowed to Fault with registry types
        expect(fault.tag).toBe("DATABASE_ERROR")
      }
    })
  })

  describe("unwrap", () => {
    it("should return the full fault chain from a wrapped fault", () => {
      const originalError = new Error("Original error")
      const fault = Fault.wrap(originalError).withTag("TEST")

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
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withContext({ service: "auth" })
      const fault3 = Fault.wrap(fault2)
        .withTag("LAYER_3")
        .withContext({ endpoint: "/login" })

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
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withContext({ service: "auth" })
      const fault3 = Fault.wrap(fault2)
        .withTag("LAYER_3")
        .withContext({ endpoint: "/login" })

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
      const root = chain.at(-1)

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
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withContext({ service: "auth" })
      const fault3 = Fault.wrap(fault2)
        .withTag("LAYER_3")
        .withContext({ endpoint: "/login" })

      const fullContext = fault3.getFullContext()

      expect(fullContext).toEqual({
        host: "localhost",
        port: 5432,
        service: "auth",
        endpoint: "/login",
      })
    })

    it("should override duplicate keys from root to current", () => {
      const fault1 = Fault.wrap(new Error("test")).withContext({
        userId: "123",
        requestId: "abc",
      })
      const fault2 = Fault.wrap(fault1).withContext({
        userId: "456",
        sessionId: "xyz",
      })

      const fullContext = fault2.getFullContext()

      // userId from fault2 should override fault1
      expect(fullContext).toEqual({
        userId: "456",
        requestId: "abc",
        sessionId: "xyz",
      })
    })

    it("should work with single fault", () => {
      const fault = Fault.wrap(new Error("test")).withContext({
        key: "value",
      })

      expect(fault.getFullContext()).toEqual({ key: "value" })
    })

    it("should work with registry-typed faults", () => {
      const fault1 = Fault.wrap(new Error("test"))
        .withTag("MY_ERROR_TAG")
        .withContext({
          errorCode: 100,
        })
      const fault2 = Fault.wrap(fault1).withTag("MY_ERROR_TAG").withContext({
        errorCode: 200,
      })

      expect(fault2.getFullContext()).toEqual({
        errorCode: 200,
      })
    })

    it("should work with extended faults", () => {
      class HttpError extends Error {
        statusCode: number
        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = Fault.extend(HttpError)

      const fault1 = Fault.wrap(new Error("test")).withContext({
        requestId: "abc",
      })
      const httpFault = HttpFault.create("Request failed", 500).withContext({
        path: "/api/users",
        method: "GET",
      })
      httpFault.cause = fault1

      expect(httpFault.getFullContext()).toEqual({
        requestId: "abc",
        path: "/api/users",
        method: "GET",
      })
    })

    it("should handle empty contexts", () => {
      const fault1 = Fault.wrap(new Error("test"))
      const fault2 = Fault.wrap(fault1).withContext({ key: "value" })

      expect(fault2.getFullContext()).toEqual({ key: "value" })
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
      const fault = Fault.wrap(new Error("test")).withTag("MY_ERROR_TAG")

      expect(fault.getTags()).toEqual(["MY_ERROR_TAG"])
    })

    it("should work with registry-typed faults", () => {
      const rootError = new Error("Invalid token")
      const fault1 = Fault.wrap(rootError).withTag("LAYER_1")
      const fault2 = Fault.wrap(fault1).withTag("AUTH_ERROR")

      expect(fault2.getTags()).toEqual(["AUTH_ERROR", "LAYER_1"])
    })

    it("should work with extended faults", () => {
      class HttpError extends Error {
        statusCode: number
        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = Fault.extend(HttpError)

      const rootError = new Error("Network timeout")
      const fault1 = Fault.wrap(rootError).withTag("NETWORK_ERROR")
      const httpFault = HttpFault.create("Request failed", 500).withTag(
        "HTTP_ERROR"
      )
      httpFault.cause = fault1

      expect(httpFault.getTags()).toEqual(["HTTP_ERROR", "NETWORK_ERROR"])
    })

    it("should only include fault tags, not raw errors", () => {
      const rawError = new Error("Raw error")
      const fault = Fault.wrap(rawError).withTag("TEST")

      // Should only include the fault tag, not anything from the raw error
      expect(fault.getTags()).toEqual(["TEST"])
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
        .withTag("MY_ERROR_TAG")
        .withDescription("Debug info", "Single error")

      expect(myError.flatten()).toBe("Single error -> Original")
    })

    it("should work with registry-typed faults", () => {
      const rootError = new Error("Invalid credentials")
      const authError = Fault.wrap(rootError)
        .withTag("AUTH_ERROR")
        .withDescription("Auth failed", "Login failed")

      expect(authError.flatten()).toBe("Login failed -> Invalid credentials")
    })

    it("should work with extended faults", () => {
      class HttpError extends Error {
        statusCode: number
        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = Fault.extend(HttpError)

      const rootError = new Error("Network timeout")
      const httpFault = HttpFault.create("Request failed", 500)
      httpFault.cause = rootError

      expect(httpFault.flatten()).toBe("Request failed -> Network timeout")
    })
  })

  describe("serialization", () => {
    describe("toSerializable", () => {
      it("should serialize a single fault", () => {
        const fault = Fault.create("DATABASE_ERROR")
          .withDescription("Failed to connect", "Database unavailable")
          .withContext({ host: "localhost", port: 5432 })

        const serialized = BaseFault.toSerializable(fault)

        expect(serialized).toEqual({
          name: "Fault",
          tag: "DATABASE_ERROR",
          message: "Database unavailable",
          debug: "Failed to connect",
          context: { host: "localhost", port: 5432 },
        })
      })

      it("should serialize a fault without debug message", () => {
        const fault = Fault.create("AUTH_ERROR").withContext({
          userId: "123",
        })

        const serialized = BaseFault.toSerializable(fault)

        expect(serialized).toEqual({
          name: "Fault",
          tag: "AUTH_ERROR",
          message: "",
          context: { userId: "123" },
        })
        expect(serialized.debug).toBeUndefined()
      })

      it("should serialize a fault chain", () => {
        const rootError = new Error("Connection timeout")
        const fault1 = Fault.wrap(rootError)
          .withTag("LAYER_1")
          .withContext({ host: "localhost", port: 5432 })

        const fault2 = Fault.wrap(fault1)
          .withTag("LAYER_2")
          .withContext({ service: "database" })

        const fault3 = Fault.wrap(fault2)
          .withTag("LAYER_3")
          .withContext({ endpoint: "/api/users" })

        const serialized = BaseFault.toSerializable(fault3)

        expect(serialized).toEqual({
          name: "Fault",
          tag: "LAYER_3",
          message: "Connection timeout",
          context: { endpoint: "/api/users" },
          cause: {
            name: "Fault",
            tag: "LAYER_2",
            message: "Connection timeout",
            context: { service: "database" },
            cause: {
              name: "Fault",
              tag: "LAYER_1",
              message: "Connection timeout",
              context: { host: "localhost", port: 5432 },
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
        const fault = Fault.wrap(rootError)
          .withTag("NETWORK_ERROR")
          .withDescription("Connection failed")

        const serialized = BaseFault.toSerializable(fault)

        expect(serialized).toEqual({
          name: "Fault",
          tag: "NETWORK_ERROR",
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
        const fault = Fault.create("VALIDATION_ERROR")
          .withDescription("Invalid input")
          .withContext({ field: "email" })

        const serialized = BaseFault.toSerializable(fault)

        expect(serialized).toEqual({
          name: "Fault",
          tag: "VALIDATION_ERROR",
          message: "",
          debug: "Invalid input",
          context: { field: "email" },
        })
        expect(serialized.cause).toBeUndefined()
      })

      it("should serialize empty context", () => {
        const fault = Fault.create("TEST") as BaseFault

        const serialized = BaseFault.toSerializable(fault)

        expect(serialized.context).toEqual({})
      })
    })
  })

  describe("getIssue", () => {
    it("should extract message from single fault", () => {
      const fault = Fault.wrap(new Error("Something happened"))
        .withTag("MY_TAG")
        .withDescription("Debug info", "User-facing message")

      expect(BaseFault.getIssue(fault)).toBe("User-facing message.")
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

      expect(BaseFault.getIssue(fault3)).toBe(
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
      expect(BaseFault.getIssue(fault2)).toBe(
        "Fault message 2. Fault message 1."
      )
    })

    it("should use original error message when no user message provided", () => {
      const originalError = new Error("Original error message")
      const fault = Fault.wrap(originalError)
        .withTag("MY_TAG")
        .withDescription("Debug info")

      expect(BaseFault.getIssue(fault)).toBe("Original error message.")
    })

    it("should add periods and join with spaces by default", () => {
      const fault1 = Fault.wrap(new Error("Error 1"))
        .withTag("LAYER_1")
        .withDescription("Debug", "Message 1")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Debug", "Message 2")

      const result = BaseFault.getIssue(fault2)
      expect(result).toBe("Message 2. Message 1.")
    })

    it("should work with registry-typed faults", () => {
      const rootError = new Error("Invalid token")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("Token validation", "Token expired")
      const fault2 = Fault.wrap(fault1)
        .withTag("AUTH_ERROR")
        .withDescription("Auth failed", "Authentication failed")

      expect(BaseFault.getIssue(fault2)).toBe(
        "Authentication failed. Token expired."
      )
    })

    it("should work with extended faults", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = Fault.extend(HttpError)

      const rootError = new Error("Network timeout")
      const fault1 = Fault.wrap(rootError)
        .withTag("NETWORK_ERROR")
        .withDescription("Network issue", "Connection timeout")
      const httpFault = HttpFault.create("Request failed", 500)
        .withTag("HTTP_ERROR")
        .withDescription("HTTP error", "Service unavailable")
      httpFault.cause = fault1

      expect(BaseFault.getIssue(httpFault)).toBe(
        "Service unavailable. Connection timeout."
      )
    })

    it("should handle empty message strings", () => {
      // biome-ignore lint/suspicious/useErrorMessage: we want to test the empty string case
      const fault = Fault.wrap(new Error("")).withTag("TEST")

      expect(BaseFault.getIssue(fault)).toBe(".")
    })

    it("should work with single fault without description", () => {
      const fault = Fault.wrap(new Error("Original message")).withTag("MY_TAG")

      expect(BaseFault.getIssue(fault)).toBe("Original message.")
    })

    it("should not add period if message already has punctuation", () => {
      const fault = Fault.wrap(new Error("Something happened!")).withTag(
        "MY_TAG"
      )

      expect(BaseFault.getIssue(fault)).toBe("Something happened!")
    })

    it("should allow custom separator", () => {
      const fault1 = Fault.wrap(new Error("Error 1")).withTag("LAYER_1")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Debug", "Error 2")

      expect(BaseFault.getIssue(fault2, { separator: " | " })).toBe(
        "Error 2. | Error 1."
      )
    })

    it("should allow custom formatter", () => {
      const fault1 = Fault.wrap(new Error("error 1")).withTag("LAYER_1")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Debug", "error 2")

      expect(
        BaseFault.getIssue(fault2, { formatter: (msg) => msg.toUpperCase() })
      ).toBe("ERROR 2 ERROR 1")
    })
  })

  describe("getDebug", () => {
    it("should extract debug message from single fault", () => {
      const fault = Fault.wrap(new Error("Something happened"))
        .withTag("MY_TAG")
        .withDescription("Debug message here")

      expect(BaseFault.getDebug(fault)).toBe("Debug message here.")
    })

    it("should extract debug messages from all faults in chain", () => {
      const rootError = new Error("Database connection failed")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("DB timeout on port 5432", "Failed to connect")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription(
          "Service failed after 3 retries",
          "Service unavailable"
        )
      const fault3 = Fault.wrap(fault2)
        .withTag("LAYER_3")
        .withDescription("API call timeout", "API failed")

      expect(BaseFault.getDebug(fault3)).toBe(
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
      expect(BaseFault.getDebug(fault2)).toBe("Debug info 2. Debug info 1.")
    })

    it("should add periods and join with spaces by default", () => {
      const fault1 = Fault.wrap(new Error("Error 1"))
        .withTag("LAYER_1")
        .withDescription("Debug 1")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Debug 2")

      const result = BaseFault.getDebug(fault2)
      expect(result).toBe("Debug 2. Debug 1.")
    })

    it("should work with registry-typed faults", () => {
      const rootError = new Error("Invalid token")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("Token validation failed")
      const fault2 = Fault.wrap(fault1)
        .withTag("AUTH_ERROR")
        .withDescription("Auth service returned 401")

      expect(BaseFault.getDebug(fault2)).toBe(
        "Auth service returned 401. Token validation failed."
      )
    })

    it("should work with extended faults", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = Fault.extend(HttpError)

      const rootError = new Error("Network timeout")
      const fault1 = Fault.wrap(rootError)
        .withTag("NETWORK_ERROR")
        .withDescription("Connection timeout after 30s")
      const httpFault = HttpFault.create("Request failed", 500)
        .withDescription("HTTP 500 error from upstream")
        .withTag("HTTP_ERROR")
      httpFault.cause = fault1

      expect(BaseFault.getDebug(httpFault)).toBe(
        "HTTP 500 error from upstream. Connection timeout after 30s."
      )
    })

    it("should handle undefined debug messages", () => {
      const fault = Fault.wrap(new Error("Something happened")).withTag("TEST")

      // When debug is undefined, it becomes empty string after filtering
      expect(BaseFault.getDebug(fault)).toBe("")
    })

    it("should handle empty debug strings", () => {
      const fault = Fault.wrap(new Error("Error"))
        .withTag("TEST")
        .withDescription("")

      expect(BaseFault.getDebug(fault)).toBe("")
    })

    it("should filter out undefined/empty debug messages in chains", () => {
      const fault1 = Fault.wrap(new Error("Error 1"))
        .withTag("LAYER_1")
        .withDescription("Debug 1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")
      // No debug description

      expect(BaseFault.getDebug(fault2)).toBe("Debug 1.")
    })
  })
})
